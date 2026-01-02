const pi_onload = frappe.listview_settings["Purchase Invoice"].onload;

frappe.listview_settings["Purchase Invoice"].onload = function (listview) {
	pi_onload(listview);
	listview.page.add_action_item(__("Payment Order"), () => {
		let checked_items = listview.get_checked_items();
		show_bulk_payment_dialog(checked_items, false, "Purchase Invoice", listview);
	});

	listview.page.add_inner_button(__("GoTo Payment Request"), () => {
		frappe.set_route("List", "Payment Request");
	});
};


const show_bulk_payment_dialog = function (selected_invoices, enable_multi_select = false, doctype = "Purchase Invoice", listview = null) {
	for (const invoice of selected_invoices) {
		invoice.amount_to_pay = invoice.outstanding_amount;
	}

	const dialog = new frappe.ui.Dialog({
		title: __("Payment Confirmation"),
		size: 'extra-large',
		fields: [
			{
				fieldname: 'payment_requests',
				fieldtype: 'Table',
				label: __("Payment Requests"),
				cannot_add_rows: true,
				cannot_delete_rows: true,
				cannot_delete_all_rows: true,
				data: selected_invoices,
				fields: [
					{
						fieldname: "name",
						label: __("Invoice No."),
						fieldtype: "Data",
						read_only: true,
						in_list_view: 1,
						columns: 2,
					},
					{
						fieldname: "supplier",
						label: __("Supplier"),
						fieldtype: "Data",
						read_only: true,
						in_list_view: 1,
						columns: 2,
					},
					{
						fieldname: "outstanding_amount",
						label: __("Outstanding Amount"),
						fieldtype: "Currency",
						read_only: true,
						in_list_view: 1,
						columns: 2,
					},
					{
						fieldname: "amount_to_pay",
						label: __("Amount to be paid"),
						fieldtype: "Currency",
						in_list_view: 1,
						columns: 2,
						reqd: 1,
					},
				]
			}
		],
		primary_action_label: __("Create Payment Order"),
		primary_action: function (values) {
			invoices_to_select = values.payment_requests.filter(r => !enable_multi_select || r.__checked);
			confirm_bulk_payment(invoices_to_select, doctype, dialog, listview);
		},
		secondary_action_label: __("Cancel"),
		secondary_action: function () {
			dialog.hide();
		}
	});

	// Override the default z-index to prevent stacking issues when displaying dialogs over dialogs.
	dialog.$wrapper.css('z-index', '1040');

	dialog.show();

	if (!enable_multi_select) {
		setTimeout(() => {
			$('.row-check').hide();
		}, 200);
	}
};


const confirm_bulk_payment = function (invoices, doctype, dialog, listview) {
	invalid_invoices = []
	for (const invoice of invoices) {
		if (invoice.amount_to_pay > invoice.outstanding_amount || invoice.amount_to_pay <= 0) {
			invalid_invoice = JSON.parse(JSON.stringify(invoice))
			invalid_invoice.is_amount_negative = invoice.amount_to_pay <= 0;
			invalid_invoices.push(invalid_invoice);
		}
	}

	if (invalid_invoices.length) {
		// Show an alert saying that there are some invalid invoices.
		show_invalid_invoices_alert(invalid_invoices);
		return;
	}

	draft_invoices = invoices.filter(i => i.docstatus == 0).map(i => i.name);

	count_of_rows = invoices.length;
	total_amount = invoices.reduce((total, invoice) => total + invoice.amount_to_pay, 0);
	frappe.confirm(
		__("Are you sure you want to create a Payment Order for <b style=\"color: green;\">{0}</b> for <b style=\"color: #1167b1\">{1}</b> {2}?", [fmt_money(total_amount), count_of_rows, count_of_rows == 1 ? __("Purchase Invoice") : __("Purchase Invoices")]),
		() => {
			if (draft_invoices.length == 0) {
				frappe
					.call({
						method:
							"india_banking.india_banking.doc_events.payment_request.make_bulk_bank_payment_request",
						args: { invoices: invoices, doctype: doctype },
					})
					.then((r) => {
						dialog.hide();
						show_confirmation_message(r);
						if (listview) {
							listview.refresh();
						}
					});
				// if (count_of_rows > 10) {
				//   frappe.show_alert("Starting a background job to create {0} {1}", [
				//     count_of_rows,
				//     __("Payment Request"),
				//   ]);
				// }
			} else {
				frappe.msgprint(__("Purchase Invoices must be submitted before attempting payment"));
			}
		}
	);
};


const show_confirmation_message = function (r) {
	const request_count = r.message.success_request;
	const po_name = r.message.payment_order;
	if (request_count > 0 && po_name) {
		setTimeout(() => {
			frappe.msgprint(
				`Payment Order <b><a href="payment-order/${po_name}">${po_name}</a></b> with <b>${request_count}</b> ${request_count == 1 ? __("Payment Request") : __("Payment Requests")} created`
			);
		}, 100);
	}
};


const show_invalid_invoices_alert = function (invalid_invoices) {
	const message = generate_validation_table(invalid_invoices);

	frappe.throw(
		title  = message,
	)
};


const generate_validation_table = function (invalid_invoices) {
	let html = '<table  class="table table-condensed table-hover table-bordered">';
	html += '<tr><th>Invoice No.</th><th>Error</th></tr>';
	
	for (const invoice of invalid_invoices) {
		const error_message = invoice.is_amount_negative 
			? __("Amount to be paid is zero or negative") 
			: __("Amount to be paid is greater than outstanding amount");
		
		html += `<tr><td><b>${invoice.name}</b></td><td>${error_message}</td></tr>`;
	}
	
	html += '</table>';
	return html;
};

frappe.show_bulk_payment_dialog = show_bulk_payment_dialog;
