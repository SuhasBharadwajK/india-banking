import frappe
from erpnext.accounts.doctype.payment_request.payment_request import (
	make_payment_request,
)

from india_banking.india_banking.doctype.bank_payment_request.bank_payment_request import get_existing_payment_request_amount
from india_banking.overrides.payment_request import make_payment_order
from india_banking.overrides.payment_order import get_party_summary


@frappe.whitelist()
def make_bulk_bank_payment_request(invoices, doctype, should_create_payment_order = False):
	# TODO MAHI: If the currrent user is anyone apart from Mahi Admin, the system should throw an exception right here and stop any further execution.

	if isinstance(should_create_payment_order, str):
		should_create_payment_order = should_create_payment_order.lower() == 'true'

	invoices = frappe.parse_json(invoices)

	for invoice in invoices:
		if should_create_payment_order and (invoice.get('amount_to_pay', 0) > invoice.get('outstanding_amount', 0) or invoice.get('amount_to_pay', 0) <= 0):
			frappe.throw('The provided amounts to pay are invalid.')

	success_requests = []
	no_payment_invoices = []
	for invoice in invoices:
		if invoice.get("name", ""):
			invoice_amount_to_pay = invoice.get('amount_to_pay', 0)
			invoice = frappe.get_doc(doctype, invoice.get("name", ""))
			if not is_valid_invoice(invoice):
				no_payment_invoices.append(invoice.name)
				continue

			try:
				args = {
					"dt": invoice.doctype,
					"dn": invoice.name,
					"recipient_id": "",
					"payment_request_type": "Outward",
					"amount_to_pay": invoice_amount_to_pay,
					"party_type": "Supplier",
					"party": invoice.supplier,
					"return_doc": 1,
					"submit_doc": 1,
				}

				pr = make_payment_request(**args)
				success_requests.append(pr)

			except Exception:
				frappe.log_error(
					f"Bulk Payment Request creation failed({invoice.name})", frappe.get_traceback()
				)

	if no_payment_invoices and not len(success_requests):
		frappe.msgprint("No Payment to Make")

	po_name = None

	if should_create_payment_order and len(success_requests):
		# Create a payment order with the submitted payment requests.
		payment_order = create_payment_order(invoices, success_requests)
		po_name = payment_order.name

	return {"success_request": len(success_requests), "payment_order": po_name}


def create_payment_order(invoices, payment_requests):
	payment_order = frappe.new_doc("Payment Order")
	print(invoices)
	# 1. Set Company from the first invoice
	payment_order.company = invoices[0]['company']
	# 2. Set the company bank account
	payment_order.company_bank_account = frappe.db.get_value(
		"Bank Account",
		{ "is_default": 1, "is_company_account": 1, "company": payment_order.company },
		["name"]
	)

	# 3. Set the Default Mode of Transfer as A2A/Internal
	modes_of_transfer = frappe.get_list("Mode of Transfer", filters = {
		'name': ['like', '%internal%']
	})

	payment_order.default_mode_of_transfer = modes_of_transfer[0].name

	# 4. Set Summarise Payment Based on as "Voucher" - Set this in India Banking Settings.
	payment_order.summarise_payment_based_on = frappe.db.get_single_value(
					"India Banking Settings",
					"summarise_payment_based_on"
				)

	# 5. Set the Payment Requests as the Payment Order references
	for request in payment_requests:
		make_payment_order(request.name, payment_order)

	# 6. Call "Get Summary" or fill the Payment Summary Line Items
	party_summary = get_party_summary(payment_order.references, payment_order.company_bank_account, payment_order.summarise_payment_based_on, payment_order.default_mode_of_transfer)
	for party_summary_item in party_summary:
		summary_item = frappe.new_doc("Payment Order Summary")
		for k, v in party_summary_item.items():
			setattr(summary_item, k, v)

		payment_order.summary.append(summary_item)

	payment_order.insert()
	payment_order.submit()
	return payment_order


def is_valid_invoice(invoice):
	existing_payment_request_amount = (
		get_existing_payment_request_amount(invoice.doctype, invoice.name) or 0
	)
	if invoice.outstanding_amount - existing_payment_request_amount > 0:
		return True

	return False
