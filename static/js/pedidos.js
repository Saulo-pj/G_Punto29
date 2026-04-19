function setFormScroll(form) {
	let input = form.querySelector('input[name="scroll_y"]');
	if (!input) {
		input = document.createElement('input');
		input.type = 'hidden';
		input.name = 'scroll_y';
		form.appendChild(input);
	}
	input.value = String(Math.max(window.scrollY || 0, 0));
}

function restoreScrollFromQuery() {
	const params = new URLSearchParams(window.location.search);
	const y = parseInt(params.get('scroll_y') || '', 10);
	if (!Number.isNaN(y)) {
		window.scrollTo({ top: Math.max(y, 0), behavior: 'auto' });
	}
}

async function submitAsync(form, formData) {
	const targetUrl = form.getAttribute('action') || window.location.href;
	const targetMethod = (form.getAttribute('method') || 'POST').toUpperCase();
	const response = await fetch(targetUrl, {
		method: targetMethod,
		body: formData,
		headers: {
			'X-Requested-With': 'XMLHttpRequest',
		},
		credentials: 'same-origin',
	});
	if (!response.ok) {
		throw new Error('No se pudo guardar.');
	}
}

function setBusy(form, busy) {
	const controls = form.querySelectorAll('button, input, select, textarea');
	for (const control of controls) {
		if (busy) {
			control.dataset.prevDisabled = control.disabled ? '1' : '0';
			control.disabled = true;
		} else if (control.dataset.prevDisabled === '0') {
			control.disabled = false;
		}
	}
}

function parseNumber(value) {
	const parsed = parseFloat(String(value || '0').replace(',', '.'));
	return Number.isNaN(parsed) ? 0 : parsed;
}

function formatNumber(value) {
	if (Number.isInteger(value)) {
		return String(value);
	}
	return String(parseFloat(value.toFixed(2)));
}

function getRequestedQty(form) {
	const meta = form.querySelector('.pedido-line-meta');
	if (!meta) {
		return 0;
	}
	const match = (meta.textContent || '').match(/pedido:\s*([-\d.,]+)/i);
	return parseNumber(match ? match[1] : '0');
}

function setLineStatus(form, state, qty) {
	const status = form.querySelector('.pedido-line-status');
	if (!status) {
		return;
	}

	status.classList.remove('ok', 'warn', 'muted');
	form.classList.toggle('is-sent', state === 'ok' || state === 'warn');

	if (state === 'ok') {
		status.classList.add('ok');
		status.textContent = 'Cocina confirmo recepcion: ' + formatNumber(qty);
		return;
	}

	if (state === 'warn') {
		status.classList.add('warn');
		status.textContent = 'Enviado a cocina: ' + formatNumber(qty) + ' (sin confirmar)';
		return;
	}

	status.classList.add('muted');
	status.textContent = 'No enviado';
}

function snapshotLineState(form) {
	const checkbox = form.querySelector('.pedidos-line-check');
	const qtyInput = form.querySelector('.pedidos-line-qty');
	const status = form.querySelector('.pedido-line-status');
	if (!checkbox || !qtyInput || !status) {
		return null;
	}

	const prevState = status.classList.contains('ok') ? 'ok' : (status.classList.contains('warn') ? 'warn' : 'muted');
	return {
		checked: checkbox.checked,
		qtyValue: qtyInput.value,
		statusState: prevState,
		formSentClass: form.classList.contains('is-sent'),
	};
}

function restoreLineState(form, snapshot) {
	if (!snapshot) {
		return;
	}
	const checkbox = form.querySelector('.pedidos-line-check');
	const qtyInput = form.querySelector('.pedidos-line-qty');
	if (checkbox) {
		checkbox.checked = snapshot.checked;
	}
	if (qtyInput) {
		qtyInput.value = snapshot.qtyValue;
	}
	setLineStatus(form, snapshot.statusState, parseNumber(snapshot.qtyValue));
	form.classList.toggle('is-sent', snapshot.formSentClass);
}

function applyLineOptimisticState(form) {
	const checkbox = form.querySelector('.pedidos-line-check');
	const qtyInput = form.querySelector('.pedidos-line-qty');
	const status = form.querySelector('.pedido-line-status');
	if (!checkbox || !qtyInput || !status) {
		return;
	}

	const wasConfirmed = status.classList.contains('ok');
	const requestedQty = Math.max(getRequestedQty(form), 0);
	let qty = Math.max(parseNumber(qtyInput.value), 0);

	if (checkbox.checked) {
		if (qty <= 0) {
			qty = Math.max(requestedQty, 1);
			qtyInput.value = formatNumber(qty);
		}
		setLineStatus(form, wasConfirmed ? 'ok' : 'warn', qty);
		return;
	}

	qtyInput.value = formatNumber(requestedQty);
	setLineStatus(form, 'muted', 0);
}

function bindPedidosAsyncForms() {
	const forms = document.querySelectorAll('.pedido-line-form.pedidos-auto-form, .pedidos-send-form.pedidos-auto-form');
	for (const form of forms) {
		form.addEventListener('submit', async (event) => {
			if (form.dataset.forceSyncSubmit === '1') {
				delete form.dataset.forceSyncSubmit;
				return;
			}
			if ((form.method || 'POST').toUpperCase() !== 'POST') {
				return;
			}

			event.preventDefault();
			setFormScroll(form);
			const formData = new FormData(form);
			if (event.submitter && event.submitter.name) {
				formData.set(event.submitter.name, event.submitter.value || '');
			}
			let shouldFallbackSyncSubmit = false;
			const lineSnapshot = form.classList.contains('pedido-line-form') ? snapshotLineState(form) : null;
			if (lineSnapshot) {
				applyLineOptimisticState(form);
			}
			setBusy(form, true);
			try {
				await submitAsync(form, formData);
			} catch (error) {
				if (lineSnapshot) {
					restoreLineState(form, lineSnapshot);
				}
				shouldFallbackSyncSubmit = true;
			} finally {
				setBusy(form, false);
			}

			if (shouldFallbackSyncSubmit) {
				form.dataset.forceSyncSubmit = '1';
				if (typeof form.requestSubmit === 'function') {
					form.requestSubmit(event.submitter || undefined);
				} else {
					form.submit();
				}
				return;
			}

			if (form.classList.contains('pedidos-send-form')) {
				const statusPill = document.querySelector('.pedidos-detail-head .status-pill');
				if (statusPill) {
					statusPill.textContent = 'Enviado';
					statusPill.classList.remove('warn');
					statusPill.classList.add('info');
				}
				form.remove();
			}
		});
	}
}

document.addEventListener('DOMContentLoaded', () => {
	restoreScrollFromQuery();
	const statusLines = document.querySelectorAll('.pedido-line-form .pedido-line-status');
	for (const status of statusLines) {
		const lineForm = status.closest('.pedido-line-form');
		if (!lineForm) {
			continue;
		}
		lineForm.classList.toggle('is-sent', status.classList.contains('ok') || status.classList.contains('warn'));
	}
	bindPedidosAsyncForms();

	const lineForms = document.querySelectorAll('.pedido-line-form.pedidos-auto-form');
	for (const form of lineForms) {
		const checkbox = form.querySelector('.pedidos-line-check');
		const qtyInput = form.querySelector('.pedidos-line-qty');

		if (checkbox) {
			checkbox.addEventListener('change', () => {
				if (typeof form.requestSubmit === 'function') {
					form.requestSubmit();
				} else {
					form.submit();
				}
			});
		}

		if (qtyInput) {
			qtyInput.addEventListener('blur', () => {
				if (typeof form.requestSubmit === 'function') {
					form.requestSubmit();
				} else {
					form.submit();
				}
			});
			qtyInput.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					if (typeof form.requestSubmit === 'function') {
						form.requestSubmit();
					} else {
						form.submit();
					}
				}
			});
		}
	}

	const genericForms = document.querySelectorAll('.pedidos-auto-form');
	for (const form of genericForms) {
		form.addEventListener('submit', () => {
			setFormScroll(form);
		});
	}
});
