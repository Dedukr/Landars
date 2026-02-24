import csv
import hashlib
from decimal import Decimal
from django.contrib import admin
from django.contrib import messages
from django.db import transaction as db_transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_http_methods
from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Q

from .models import BankTransaction, StatementBatch, ReconciliationMatch
from .parser import StatementParser
from .matcher import TransactionMatcher
from api.models import Order


@admin.register(StatementBatch)
class StatementBatchAdmin(admin.ModelAdmin):
    list_display = ['id', 'filename', 'uploaded_at', 'uploaded_by', 'transaction_count']
    list_filter = ['uploaded_at']
    search_fields = ['filename']
    readonly_fields = ['uploaded_at', 'file_hash']

    def has_add_permission(self, request):
        return False

    def transaction_count(self, obj):
        return obj.transactions.count()
    transaction_count.short_description = 'Transactions'
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                'upload-statement/',
                self.admin_site.admin_view(upload_statement_view),
                name='reconciliation_statementbatch_upload',
            ),
        ]
        return custom_urls + urls
    


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'statement_date',
        'payer_name',
        'amount_display',
        'match_status',
        'matched_order_link',
        'confidence_score_display',
        'batch',
    ]
    list_filter = ['match_status', 'batch', 'statement_date_parsed']
    search_fields = ['payer_name', 'raw_line', 'matched_order__id']
    readonly_fields = [
        'batch',
        'statement_date',
        'statement_date_parsed',
        'amount',
        'payer_name',
        'raw_line',
        'matched_order',
        'confidence_score',
        'matching_reason',
        'matched_by',
        'matched_at',
        'rejected_at',
        'created_at',
        'updated_at',
        'suggestions_display',
    ]
    fieldsets = (
        ('Transaction Details', {
            'fields': ('batch', 'statement_date', 'statement_date_parsed', 'amount', 'payer_name', 'raw_line')
        }),
        ('Matching', {
            'fields': ('match_status', 'matched_order', 'confidence_score', 'matching_reason', 'suggestions_display')
        }),
        ('Audit', {
            'fields': ('matched_by', 'matched_at', 'rejected_at', 'created_at', 'updated_at')
        }),
    )
    
    actions = ['export_selected', 'export_unmatched', 'rerun_matching']
    
    def amount_display(self, obj):
        return f"£{obj.amount}"
    amount_display.short_description = 'Amount'
    amount_display.admin_order_field = 'amount'
    
    def matched_order_link(self, obj):
        if obj.matched_order:
            url = reverse('admin:api_order_change', args=[obj.matched_order.id])
            return format_html('<a href="{}">Order #{}</a>', url, obj.matched_order.id)
        return '-'
    matched_order_link.short_description = 'Matched Order'

    def confidence_score_display(self, obj):
        """Show confidence with %; when matched and 0 show '—' (manual match)."""
        if obj.match_status == BankTransaction.MatchStatus.MATCHED:
            if obj.confidence_score:
                return format_html('{}%', obj.confidence_score)
            return '—'  # Manual match, no score
        if obj.confidence_score:
            return format_html('{}%', obj.confidence_score)
        return '-'
    confidence_score_display.short_description = 'Confidence'
    
    def suggestions_display(self, obj):
        """Display match suggestions in detail view."""
        if obj.match_status == BankTransaction.MatchStatus.MATCHED:
            order_id = obj.matched_order.id if obj.matched_order else 'N/A'
            conf = f' (confidence: {obj.confidence_score}%)' if obj.confidence_score else ' (manual match)'
            return format_html('<strong>Matched to Order #{} {}</strong>', order_id, conf)
        
        suggestions = ReconciliationMatch.objects.filter(transaction=obj).order_by('-confidence_score')[:5]
        if not suggestions:
            return 'No suggestions available'
        
        html = '<table style="width:100%; border-collapse: collapse;">'
        html += '<tr><th style="border:1px solid #ddd; padding:8px;">Order ID</th>'
        html += '<th style="border:1px solid #ddd; padding:8px;">Customer</th>'
        html += '<th style="border:1px solid #ddd; padding:8px;">Amount</th>'
        html += '<th style="border:1px solid #ddd; padding:8px;">Date</th>'
        html += '<th style="border:1px solid #ddd; padding:8px;">Confidence</th>'
        html += '<th style="border:1px solid #ddd; padding:8px;">Reason</th>'
        html += '<th style="border:1px solid #ddd; padding:8px;">Actions</th></tr>'
        
        for match in suggestions:
            order = match.suggested_order
            order_url = reverse('admin:api_order_change', args=[order.id])
            confirm_url = reverse('admin:reconciliation_banktransaction_confirm_match', args=[obj.id, order.id])
            reject_url = reverse('admin:reconciliation_banktransaction_reject', args=[obj.id])
            
            html += f'<tr>'
            html += f'<td style="border:1px solid #ddd; padding:8px;"><a href="{order_url}">#{order.id}</a></td>'
            html += f'<td style="border:1px solid #ddd; padding:8px;">{order.customer.name if order.customer else "N/A"}</td>'
            html += f'<td style="border:1px solid #ddd; padding:8px;">£{order.total_price}</td>'
            html += f'<td style="border:1px solid #ddd; padding:8px;">{order.created_at.date()}</td>'
            html += f'<td style="border:1px solid #ddd; padding:8px;">{match.confidence_score}%</td>'
            html += f'<td style="border:1px solid #ddd; padding:8px;">{match.matching_reason}</td>'
            html += f'<td style="border:1px solid #ddd; padding:8px;">'
            html += f'<a href="{confirm_url}" style="margin-right:10px;">Confirm</a>'
            html += f'</td>'
            html += f'</tr>'
        
        html += '</table>'
        html += f'<br><a href="{reject_url}" style="color:red;">Reject all suggestions</a>'
        
        return format_html(html)
    suggestions_display.short_description = 'Match Suggestions'
    
    def export_selected(self, request, queryset):
        """Export selected transactions to CSV."""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="bank_transactions_export.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Statement Date',
            'Payer Name',
            'Amount',
            'Match Status',
            'Matched Order ID',
            'Confidence Score',
            'Matching Reason',
            'Raw Line',
        ])
        
        for txn in queryset:
            writer.writerow([
                txn.id,
                txn.statement_date,
                txn.payer_name,
                txn.amount,
                txn.get_match_status_display(),
                txn.matched_order.id if txn.matched_order else '',
                txn.confidence_score,
                txn.matching_reason,
                txn.raw_line,
            ])
        
        return response
    export_selected.short_description = "Export selected transactions to CSV"
    
    def export_unmatched(self, request, queryset):
        """Export unmatched transactions to CSV."""
        unmatched = queryset.filter(match_status__in=['unmatched', 'suggested'])
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="unmatched_transactions.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'ID',
            'Statement Date',
            'Payer Name',
            'Amount',
            'Match Status',
            'Confidence Score',
            'Matching Reason',
            'Raw Line',
        ])
        
        for txn in unmatched:
            writer.writerow([
                txn.id,
                txn.statement_date,
                txn.payer_name,
                txn.amount,
                txn.get_match_status_display(),
                txn.confidence_score,
                txn.matching_reason,
                txn.raw_line,
            ])
        
        self.message_user(request, f"Exported {unmatched.count()} unmatched transactions.")
        return response
    export_unmatched.short_description = "Export unmatched transactions to CSV"
    
    def rerun_matching(self, request, queryset):
        """Rerun matching for selected transactions."""
        count = 0
        for txn in queryset:
            if txn.match_status != BankTransaction.MatchStatus.MATCHED:
                matcher = TransactionMatcher(txn)
                suggestions = matcher.match_transaction()
                
                # Clear old suggestions
                ReconciliationMatch.objects.filter(transaction=txn).delete()
                
                # Create new suggestions
                for suggestion in suggestions:
                    ReconciliationMatch.objects.create(
                        transaction=txn,
                        suggested_order=suggestion['order'],
                        confidence_score=suggestion['confidence_score'],
                        matching_reason=suggestion['matching_reason'],
                    )
                
                # Auto-match if high confidence
                auto_matched_order = matcher.auto_match_if_high_confidence()
                if auto_matched_order:
                    conf = suggestions[0]['confidence_score'] if suggestions else None
                    txn.mark_as_matched(auto_matched_order, request.user, "Auto-matched (high confidence)", confidence_score=conf)
                else:
                    if suggestions:
                        txn.match_status = BankTransaction.MatchStatus.SUGGESTED
                        txn.confidence_score = suggestions[0]['confidence_score']
                        txn.matching_reason = suggestions[0]['matching_reason']
                    else:
                        txn.match_status = BankTransaction.MatchStatus.UNMATCHED
                    txn.save()
                
                count += 1
        
        self.message_user(request, f"Reran matching for {count} transactions.")
    rerun_matching.short_description = "Rerun matching for selected transactions"
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<int:txn_id>/confirm-match/<int:order_id>/',
                self.admin_site.admin_view(self.confirm_match_view),
                name='reconciliation_banktransaction_confirm_match',
            ),
            path(
                '<int:txn_id>/reject/',
                self.admin_site.admin_view(self.reject_view),
                name='reconciliation_banktransaction_reject',
            ),
            path(
                'review/',
                self.admin_site.admin_view(self.review_view),
                name='reconciliation_banktransaction_review',
            ),
        ]
        return custom_urls + urls
    
    def confirm_match_view(self, request, txn_id, order_id):
        """Confirm a match between transaction and order."""
        txn = get_object_or_404(BankTransaction, id=txn_id)
        order = get_object_or_404(Order, id=order_id)
        # Use suggestion's confidence score if this order was a suggestion
        match = ReconciliationMatch.objects.filter(transaction=txn, suggested_order=order).order_by('-confidence_score').first()
        conf = match.confidence_score if match else None
        txn.mark_as_matched(order, request.user, f"Manually confirmed by {request.user.name}", confidence_score=conf)
        messages.success(request, f"Transaction {txn_id} matched to Order #{order_id}")
        return redirect('admin:reconciliation_banktransaction_change', txn_id)
    
    def reject_view(self, request, txn_id):
        """Reject all suggestions for a transaction."""
        txn = get_object_or_404(BankTransaction, id=txn_id)
        txn.mark_as_rejected()
        
        messages.success(request, f"Transaction {txn_id} marked as rejected")
        return redirect('admin:reconciliation_banktransaction_change', txn_id)
    
    def review_view(self, request):
        """Review page for all transactions."""
        status_filter = request.GET.get('status', '')
        search_query = request.GET.get('q', '')
        
        transactions = BankTransaction.objects.all()
        
        if status_filter:
            transactions = transactions.filter(match_status=status_filter)
        
        if search_query:
            transactions = transactions.filter(
                Q(payer_name__icontains=search_query) |
                Q(raw_line__icontains=search_query) |
                Q(matched_order__id__icontains=search_query)
            )
        
        transactions = transactions.select_related('matched_order', 'matched_order__customer', 'batch').order_by('-statement_date_parsed', '-created_at')
        
        context = {
            'transactions': transactions,
            'status_filter': status_filter,
            'search_query': search_query,
            'status_choices': BankTransaction.MatchStatus.choices,
        }
        
        return render(request, 'admin/reconciliation/review.html', context)




# Custom admin view for uploading statements
def upload_statement_view(request):
    """Handle PDF statement upload."""
    if request.method == 'POST':
        if 'pdf_file' not in request.FILES:
            messages.error(request, "No file uploaded")
            return redirect('admin:reconciliation_statementbatch_changelist')
        
        pdf_file = request.FILES['pdf_file']
        
        # Save to temp file
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            for chunk in pdf_file.chunks():
                tmp_file.write(chunk)
            tmp_path = tmp_file.name
        
        try:
            # Calculate file hash for deduplication
            from datetime import datetime
            parser = StatementParser(upload_date=datetime.now())
            file_hash = parser.calculate_file_hash(tmp_path)
            
            # Check if batch already exists
            existing_batch = StatementBatch.objects.filter(file_hash=file_hash).first()
            if existing_batch:
                messages.warning(request, f"This statement was already uploaded on {existing_batch.uploaded_at.date()}")
                os.unlink(tmp_path)
                return redirect(f"{reverse('admin:reconciliation_banktransaction_changelist')}?batch={existing_batch.id}")
            
            # Parse PDF
            transactions_data = parser.parse_pdf(tmp_path)
            
            if not transactions_data:
                messages.error(request, "No transactions found in PDF")
                os.unlink(tmp_path)
                return redirect('admin:reconciliation_statementbatch_changelist')
            
            # Create batch and transactions
            with db_transaction.atomic():
                batch = StatementBatch.objects.create(
                    filename=pdf_file.name,
                    file_hash=file_hash,
                    uploaded_by=request.user,
                )
                
                transactions = []
                for txn_data in transactions_data:
                    txn = BankTransaction.objects.create(
                        batch=batch,
                        statement_date=txn_data['statement_date'],
                        statement_date_parsed=txn_data['statement_date_parsed'],
                        amount=txn_data['amount'],
                        payer_name=txn_data['payer_name'],
                        raw_line=txn_data['raw_line'],
                    )
                    transactions.append(txn)
                
                # Run matching for all transactions
                matched_count = 0
                suggested_count = 0
                
                for txn in transactions:
                    matcher = TransactionMatcher(txn)
                    suggestions = matcher.match_transaction()
                    
                    # Create match suggestions
                    for suggestion in suggestions:
                        ReconciliationMatch.objects.create(
                            transaction=txn,
                            suggested_order=suggestion['order'],
                            confidence_score=suggestion['confidence_score'],
                            matching_reason=suggestion['matching_reason'],
                        )
                    
                    # Auto-match if high confidence
                    auto_matched_order = matcher.auto_match_if_high_confidence()
                    if auto_matched_order:
                        conf = suggestions[0]['confidence_score'] if suggestions else None
                        txn.mark_as_matched(auto_matched_order, request.user, "Auto-matched (high confidence)", confidence_score=conf)
                        matched_count += 1
                    else:
                        if suggestions:
                            txn.match_status = BankTransaction.MatchStatus.SUGGESTED
                            txn.confidence_score = suggestions[0]['confidence_score']
                            txn.matching_reason = suggestions[0]['matching_reason']
                            suggested_count += 1
                        else:
                            txn.match_status = BankTransaction.MatchStatus.UNMATCHED
                        txn.save()
            
            messages.success(
                request,
                f"Uploaded {len(transactions)} transactions. "
                f"Auto-matched: {matched_count}, Suggestions: {suggested_count}, Unmatched: {len(transactions) - matched_count - suggested_count}"
            )
            
            os.unlink(tmp_path)
            return redirect(f"{reverse('admin:reconciliation_banktransaction_changelist')}?batch={batch.id}")
            
        except Exception as e:
            messages.error(request, f"Error processing PDF: {str(e)}")
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return redirect('admin:reconciliation_statementbatch_changelist')
    
    # GET request - redirect to changelist (upload form is on that page)
    return redirect('admin:reconciliation_statementbatch_changelist')


