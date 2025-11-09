import json

class BankingBackendResponse:
	def __init__(self):
		self.ok = False
		self.status = None
		self.status_code = 0
		self.message = None

	def json(self):
		return {"message": self.message}
