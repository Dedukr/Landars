#!/bin/bash
# PostgreSQL WAL Archive Cleanup Script
# Cleans up old WAL files and manages archive retention

set -e

# Configuration
ARCHIVE_DIR="/var/lib/postgresql/archive"
BACKUP_DIR="/var/lib/postgresql/backups"
RETENTION_DAYS=${WAL_RETENTION_DAYS:-7}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Logging functions
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
}

log_warning() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] $1"
}

# Show usage information
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -w, --wal-days DAYS         WAL retention days (default: $RETENTION_DAYS)"
    echo "  -b, --backup-days DAYS      Backup retention days (default: $BACKUP_RETENTION_DAYS)"
    echo "  -d, --dry-run               Show what would be deleted without executing"
    echo "  -f, --force                 Force cleanup without confirmation"
    echo "  -a, --archive-only          Only clean up WAL archive files"
    echo "  -k, --backup-only           Only clean up backup files"
    echo "  -h, --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --dry-run                # Show what would be cleaned up"
    echo "  $0 --wal-days 14            # Keep WAL files for 14 days"
    echo "  $0 --backup-days 60         # Keep backups for 60 days"
    echo "  $0 --archive-only           # Only clean WAL files"
    echo "  $0 --force                  # Clean without confirmation"
}

# Parse command line arguments
DRY_RUN=false
FORCE=false
ARCHIVE_ONLY=false
BACKUP_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--wal-days)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -b|--backup-days)
            BACKUP_RETENTION_DAYS="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -a|--archive-only)
            ARCHIVE_ONLY=true
            shift
            ;;
        -k|--backup-only)
            BACKUP_ONLY=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check if running as postgres user
if [[ "$(whoami)" != "postgres" ]]; then
    log_error "This script must be run as the postgres user"
    exit 1
fi

# Clean up WAL archive files
cleanup_wal_archive() {
    log_info "Cleaning up WAL archive files older than $RETENTION_DAYS days..."
    
    if [[ ! -d "$ARCHIVE_DIR" ]]; then
        log_warning "Archive directory does not exist: $ARCHIVE_DIR"
        return 0
    fi
    
    # Find old WAL files
    local old_wals=$(find "$ARCHIVE_DIR" -name "*.wal" -mtime +$RETENTION_DAYS -type f)
    local old_partials=$(find "$ARCHIVE_DIR" -name "*.partial" -mtime +$RETENTION_DAYS -type f)
    
    local wal_count=$(echo "$old_wals" | grep -c . || echo "0")
    local partial_count=$(echo "$old_partials" | grep -c . || echo "0")
    
    if [[ $wal_count -eq 0 && $partial_count -eq 0 ]]; then
        log_info "No old WAL files found to clean up"
        return 0
    fi
    
    echo "Found $wal_count WAL files and $partial_count partial files to clean up"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would delete the following files:"
        echo "$old_wals" | sed 's/^/  /'
        echo "$old_partials" | sed 's/^/  /'
        return 0
    fi
    
    # Confirm deletion unless forced
    if [[ "$FORCE" != true ]]; then
        echo "Are you sure you want to delete these files? (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Cleanup cancelled by user"
            return 0
        fi
    fi
    
    # Delete old WAL files
    local deleted_wals=0
    local deleted_partials=0
    
    if [[ $wal_count -gt 0 ]]; then
        while IFS= read -r file; do
            if [[ -n "$file" && -f "$file" ]]; then
                rm -f "$file"
                ((deleted_wals++))
            fi
        done <<< "$old_wals"
    fi
    
    if [[ $partial_count -gt 0 ]]; then
        while IFS= read -r file; do
            if [[ -n "$file" && -f "$file" ]]; then
                rm -f "$file"
                ((deleted_partials++))
            fi
        done <<< "$old_partials"
    fi
    
    log_success "Cleaned up $deleted_wals WAL files and $deleted_partials partial files"
}

# Clean up old backup files
cleanup_backups() {
    log_info "Cleaning up backup files older than $BACKUP_RETENTION_DAYS days..."
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warning "Backup directory does not exist: $BACKUP_DIR"
        return 0
    fi
    
    # Find old backup directories
    local old_backups=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "base_backup_*" -mtime +$BACKUP_RETENTION_DAYS)
    local backup_count=$(echo "$old_backups" | grep -c . || echo "0")
    
    if [[ $backup_count -eq 0 ]]; then
        log_info "No old backup files found to clean up"
        return 0
    fi
    
    echo "Found $backup_count backup directories to clean up"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN: Would delete the following backup directories:"
        echo "$old_backups" | sed 's/^/  /'
        return 0
    fi
    
    # Confirm deletion unless forced
    if [[ "$FORCE" != true ]]; then
        echo "Are you sure you want to delete these backup directories? (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_info "Backup cleanup cancelled by user"
            return 0
        fi
    fi
    
    # Delete old backup directories
    local deleted_backups=0
    while IFS= read -r backup_dir; do
        if [[ -n "$backup_dir" && -d "$backup_dir" ]]; then
            rm -rf "$backup_dir"
            ((deleted_backups++))
        fi
    done <<< "$old_backups"
    
    log_success "Cleaned up $deleted_backups backup directories"
}

# Show cleanup statistics
show_cleanup_stats() {
    log_info "Cleanup Statistics:"
    
    # WAL archive statistics
    if [[ -d "$ARCHIVE_DIR" ]]; then
        local total_wals=$(find "$ARCHIVE_DIR" -name "*.wal" -type f | wc -l)
        local total_partials=$(find "$ARCHIVE_DIR" -name "*.partial" -type f | wc -l)
        local archive_size=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1 || echo "0")
        
        echo "WAL Archive:"
        echo "  Total WAL files: $total_wals"
        echo "  Total partial files: $total_partials"
        echo "  Archive size: $archive_size"
    fi
    
    # Backup statistics
    if [[ -d "$BACKUP_DIR" ]]; then
        local total_backups=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "base_backup_*" | wc -l)
        local backup_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "0")
        
        echo "Backups:"
        echo "  Total backup directories: $total_backups"
        echo "  Backup size: $backup_size"
    fi
}

# Main execution
main() {
    echo "=== PostgreSQL Archive Cleanup ==="
    echo "Timestamp: $(date)"
    echo "WAL retention: $RETENTION_DAYS days"
    echo "Backup retention: $BACKUP_RETENTION_DAYS days"
    echo "Dry run: $DRY_RUN"
    echo ""
    
    # Show current statistics
    show_cleanup_stats
    echo ""
    
    # Clean up WAL files
    if [[ "$BACKUP_ONLY" != true ]]; then
        cleanup_wal_archive
        echo ""
    fi
    
    # Clean up backup files
    if [[ "$ARCHIVE_ONLY" != true ]]; then
        cleanup_backups
        echo ""
    fi
    
    # Show final statistics
    log_info "Final statistics after cleanup:"
    show_cleanup_stats
    
    log_success "Archive cleanup completed"
}

# Run main function
main
