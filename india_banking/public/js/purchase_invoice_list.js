const pi_onload = frappe.listview_settings["Purchase Invoice"].onload;

frappe.listview_settings["Purchase Invoice"].onload = function (listview) {
  pi_onload(listview);
  listview.page.add_action_item(__("Payment Request"), () => {
    create_bulk_request(listview, "Purchase Invoice");
  });

  listview.page.add_inner_button(__("GoTo Payment Request"), () => {
    frappe.set_route("List", "Payment Request");
  });
};

const create_bulk_request = function (listview, doctype) {
  let checked_items = listview.get_checked_items();
  const doc_name = [];
  checked_items.forEach((Item) => {
    if (Item.docstatus == 0) {
      doc_name.push(Item.name);
    }
  });
  let count_of_rows = checked_items.length;
  frappe.confirm(
    __("Create a Payment Order for <b>{0}</b> {1}?", [count_of_rows, count_of_rows == 1 ? __("Purchase Invoice") : __("Purchase Invoices")]),
    () => {
      if (doc_name.length == 0) {
        frappe
          .call({
            method:
              "india_banking.india_banking.doc_events.payment_request.make_bulk_bank_payment_request",
            args: { invoices: checked_items, doctype: doctype },
          })
					.then((r) => {
						const request_count = r.message.success_request
						const po_name = r.message.payment_order
            if (request_count > 0 && po_name) {
              setTimeout(() => {
                frappe.msgprint(
                  `Payment Order <b><a href="payment-order/${po_name}">${po_name}</a></b> with <b>${request_count}</b> ${request_count == 1 ? __("Payment Request") : __("Payment Requests")} created`
                );
              }, 1000);
            }
          });
        // if (count_of_rows > 10) {
        //   frappe.show_alert("Starting a background job to create {0} {1}", [
        //     count_of_rows,
        //     __("Payment Request"),
        //   ]);
        // }
      } else {
        frappe.msgprint(__("Selected document must be in submitted state"));
      }
    }
  );
};
