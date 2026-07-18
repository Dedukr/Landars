/**
 * When customer is selected/changed on Order add or change form,
 * fetch their billing address and prefill the billing fields.
 *
 * Note: also inlined in change_form.html because Docker static_volume
 * can hide newly collected Media assets.
 */
(function ($) {
  "use strict";

  var FIELD_MAP = {
    bill_company_name: "company_name",
    bill_contact_name: "contact_name",
    bill_address_line: "address_line",
    bill_address_line2: "address_line2",
    bill_city: "city",
    bill_postal_code: "postal_code",
  };

  var requestSeq = 0;

  function billingUrl(customerId) {
    var template = window.ORDER_CUSTOMER_BILLING_URL_TEMPLATE;
    if (template) {
      return template.replace("999999999", String(customerId));
    }
    var base = window.location.pathname
      .replace(/\/add\/?$/, "/")
      .replace(/\/\d+\/change\/?$/, "/");
    return base + "customer-billing/" + customerId + "/";
  }

  function setTextField(name, value) {
    var $el = $("#id_" + name);
    if ($el.length) {
      $el.val(value || "");
    }
  }

  function setUseDelivery(checked) {
    var $el = $("#id_bill_use_delivery_address");
    if ($el.length) {
      $el.prop("checked", !!checked);
    }
  }

  function clearBillingFields() {
    setUseDelivery(true);
    Object.keys(FIELD_MAP).forEach(function (formName) {
      setTextField(formName, "");
    });
  }

  function applyBilling(data) {
    setUseDelivery(
      data.bill_use_delivery_address === undefined
        ? true
        : data.bill_use_delivery_address
    );
    Object.keys(FIELD_MAP).forEach(function (formName) {
      setTextField(formName, data[FIELD_MAP[formName]]);
    });
  }

  function fetchBilling(customerId) {
    var seq = ++requestSeq;
    if (!customerId) {
      clearBillingFields();
      return;
    }
    $.getJSON(billingUrl(customerId))
      .done(function (data) {
        if (seq !== requestSeq) {
          return;
        }
        applyBilling(data || {});
      })
      .fail(function () {
        if (seq !== requestSeq) {
          return;
        }
        clearBillingFields();
      });
  }

  $(function () {
    var $customer = $("#id_customer");
    if (!$customer.length) {
      return;
    }
    function onCustomerChange() {
      fetchBilling($customer.val());
    }
    $customer.on("change", onCustomerChange);
    $customer.on("select2:select select2:clear", onCustomerChange);
  });
})(django.jQuery);
