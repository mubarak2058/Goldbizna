GOLDBIZNA M-PESA INTEGRATION

The POS supports M-Pesa transaction-code recording and multiple/split payments in the browser.

Automatic retrieval of transactions arriving at a real M-Pesa Till requires a server-side Safaricom Daraja integration and callback endpoint. GitHub Pages only serves static files, so it cannot itself receive private Till callbacks.

Use Safaricom Daraja 3.0 to create/configure the appropriate M-Pesa API application, credentials, callback URL and production access. Never place Daraja consumer secrets in browser HTML/JavaScript.

Official portal: https://developer.safaricom.co.ke/
