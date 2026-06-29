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
	}
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

				// Construir resumen de productos enviados
				try {
					const detailCard = document.querySelector('.pedidos-detail-card');
					const header = detailCard ? detailCard.querySelector('.pedidos-detail-head h3') : null;
					const pedidoText = header ? header.textContent.trim() : '';
					const items = [];
					const headEl = detailCard ? detailCard.querySelector('.pedidos-detail-head') : null;
					const subtitleEl = headEl ? headEl.querySelector('.status-pill') : null;
					const sedeName = headEl ? (headEl.dataset.sede || '') : '';
					const turnoName = headEl ? (headEl.dataset.turno || '') : '';
					const subtitleText = subtitleEl ? subtitleEl.textContent.trim() : '';
					const sentSubtitle = subtitleText + (sedeName || turnoName ? (' | ' + sedeName + (sedeName && turnoName ? ' / ' : '') + turnoName) : '');
					const lines = detailCard ? detailCard.querySelectorAll('.pedidos-lines .pedido-line-text') : [];
					for (const line of lines) {
						const nameEl = line.querySelector('.pedido-line-name');
						const metaEl = line.querySelector('.pedido-line-meta');
						if (!nameEl) continue;
						const name = nameEl.textContent.trim();
						let qty = '';
						if (metaEl) {
							const m = (metaEl.textContent || '').match(/pedido:\s*([\d.,]+)/i);
							qty = m ? m[1].trim() : (metaEl.textContent || '').trim();
						}
						items.push({ name, qty });
					}
					showSentModal('PRODUCTOS ENVIADOS', pedidoText + ' | ' + sentSubtitle, items);
				} catch (e) {
					// silencioso
				}

				form.remove();
			}
		});
	}
}

// Muestra un modal simple con resumen de productos enviados (similar a checklist)
function showSentModal(title, subtitle, items) {
	const overlay = document.createElement('div');
	overlay.className = 'sent-modal-overlay';
	overlay.style.position = 'fixed';
	overlay.style.left = '0';
	overlay.style.top = '0';
	overlay.style.right = '0';
	overlay.style.bottom = '0';
	overlay.style.background = 'rgba(0,0,0,0.35)';
	overlay.style.display = 'flex';
	overlay.style.alignItems = 'center';
	overlay.style.justifyContent = 'center';
	overlay.style.zIndex = '9999';

	const box = document.createElement('div');
	box.style.width = '320px';
	box.style.maxWidth = '92%';
	box.style.background = '#fff';
	box.style.borderRadius = '10px';
	box.style.padding = '18px';
	box.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';

	const icon = document.createElement('div');
	icon.style.textAlign = 'center';
	icon.innerHTML = '<div style="width:48px;height:48px;border-radius:50%;background:#eaf6ee;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;color:#1a9a3a;font-weight:700">✓</div>';
	box.appendChild(icon);

	const t = document.createElement('div');
	t.style.textAlign = 'center';
	t.style.marginBottom = '6px';
	t.innerHTML = '<small style="color:#777;display:block">PRODUCTOS ENVIADOS</small><strong style="display:block;margin-top:6px">' + (subtitle || title) + '</strong>';
	box.appendChild(t);

	const list = document.createElement('div');
	list.style.maxHeight = '180px';
	list.style.overflow = 'auto';
	list.style.margin = '12px 0';

	for (const it of items) {
		const row = document.createElement('div');
		row.style.display = 'flex';
		row.style.justifyContent = 'space-between';
		row.style.padding = '8px 10px';
		row.style.borderRadius = '6px';
		row.style.background = '#f7f7f7';
		row.style.marginBottom = '8px';
		const name = document.createElement('div');
		name.style.flex = '1';
		name.style.marginRight = '8px';
		name.textContent = '• ' + it.name;
		const qty = document.createElement('div');
		qty.style.whiteSpace = 'nowrap';
		qty.style.color = '#333';
		qty.textContent = it.qty || '';
		row.appendChild(name);
		row.appendChild(qty);
		list.appendChild(row);
	}

	box.appendChild(list);

	const btn = document.createElement('button');
	btn.textContent = 'ENTENDIDO';
	btn.className = 'btn-send';
	btn.style.display = 'block';
	btn.style.width = '100%';
	btn.style.marginTop = '8px';
	btn.addEventListener('click', () => {
		document.body.removeChild(overlay);
	});
	box.appendChild(btn);

	overlay.appendChild(box);
	document.body.appendChild(overlay);
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

	// Impresión de pedido: separa enviados y no enviados y abre diálogo de impresión
	const printBtn = document.getElementById('pedido-print-btn');
	const printFormatSelect = document.getElementById('pedido-print-format');
	if (printBtn) {
		printBtn.addEventListener('click', () => {
			const detailCard = document.querySelector('.pedidos-detail-card');
			if (!detailCard) return;
			const header = detailCard.querySelector('.pedidos-detail-head h3');
			const subtitle = detailCard.querySelector('.pedidos-detail-head .status-pill');
			const pedidoTitle = header ? header.textContent.trim() : 'Pedido';
			const lines = Array.from(detailCard.querySelectorAll('.pedidos-lines .pedido-line-form'));
			const enviados = [];
			const no_enviados = [];
			for (const form of lines) {
				const nameEl = form.querySelector('.pedido-line-name');
				const metaEl = form.querySelector('.pedido-line-meta');
				const statusEl = form.querySelector('.pedido-line-status');
				const qtyInput = form.querySelector('.pedidos-line-qty');
				const name = nameEl ? nameEl.textContent.trim() : '';
				let pedidoQty = '';
				if (metaEl) {
					const m = (metaEl.textContent||'').match(/pedido:\s*([\d.,]+)/i);
					pedidoQty = m ? m[1] : (metaEl.textContent||'').trim();
				}
				const qtyEnv = qtyInput ? qtyInput.value : '';
				const isSent = statusEl && (statusEl.classList.contains('ok') || statusEl.classList.contains('warn'));
				const row = { name, pedidoQty, qtyEnv };
				if (isSent) enviados.push(row); else no_enviados.push(row);
			}

			const format = (printFormatSelect && printFormatSelect.value) || 'A4';
			let css = '';
			if (format === '80mm') {
				css = 'body{font-family:Arial,Helvetica,sans-serif;padding:6mm;margin:0;width:80mm;}h1{font-size:14px;}table{width:100%;border-collapse:collapse;font-size:12px;}td{padding:4px 0;}hr{border-top:1px dashed #444;margin:6px 0;} .sig{height:50px;margin-top:18px;border-bottom:1px solid #000;width:80mm;display:block;}';
			} else {
				css = 'body{font-family:Arial,Helvetica,sans-serif;padding:12mm;}h1{font-size:18px;}table{width:100%;border-collapse:collapse;font-size:14px;}td{padding:6px 0;}hr{border-top:1px dashed #444;margin:8px 0;} .sig{height:60px;margin-top:18px;border-bottom:1px solid #000;width:200mm;display:block;}';
			}

			let html = '<!doctype html><html><head><meta charset="utf-8"><title>' + pedidoTitle + '</title>';
			html += '<style>' + css + '</style></head><body>';
			html += '<h1>' + pedidoTitle + '</h1>';
			if (subtitle) html += '<div>' + subtitle.textContent.trim() + '</div>';
			html += '<h3>Enviando</h3>';
			if (enviados.length === 0) html += '<div>No hay productos enviados.</div>'; else {
				html += '<table>';
				for (const it of enviados) {
					html += '<tr><td>' + (it.name || '') + '</td><td style="text-align:right;">' + (it.qtyEnv || it.pedidoQty || '') + '</td></tr>';
				}
				html += '</table>';
			}
			html += '<hr/>';
			html += '<h3>No enviado por falta de stock</h3>';
			if (no_enviados.length === 0) html += '<div>No hay productos pendientes por falta de stock.</div>'; else {
				html += '<table>';
				for (const it of no_enviados) {
					html += '<tr><td>' + (it.name || '') + '</td><td style="text-align:right;">' + (it.pedidoQty || '') + '</td></tr>';
				}
				html += '</table>';
			}

			html += '<div style="margin-top:18px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">';
			html += '<div style="flex:1;min-width:180px"><div class="sig"></div><div style="text-align:center;margin-top:6px;">Enviado por</div></div>';
			html += '<div style="flex:1;min-width:180px"><div class="sig"></div><div style="text-align:center;margin-top:6px;">Recibido por</div></div>';
			html += '</div>';
			html += '</body></html>';

			const w = window.open('', '_blank');
			if (!w) {
				alert('No se pudo abrir ventana de impresión. Verifique el bloqueador de ventanas emergentes.');
				return;
			}
			w.document.open();
			w.document.write(html);
			w.document.close();
			// esperar carga para imprimir
			setTimeout(() => {
				w.focus();
				w.print();
			}, 500);
		});
	}
});
