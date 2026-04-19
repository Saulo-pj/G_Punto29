document.addEventListener('change', (event) => {
	const checkbox = event.target.closest('[data-auto-submit]');
	if (!checkbox) {
		return;
	}

	const form = checkbox.form;
	if (form) {
		if (typeof form.requestSubmit === 'function') {
			form.requestSubmit();
		} else {
			form.submit();
		}
	}
});

async function submitFormAsync(form, formData) {
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
		throw new Error('No se pudo guardar el formulario.');
	}
}

function setFormBusy(form, busy) {
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

function formatQty(value) {
	if (Number.isInteger(value)) {
		return String(value);
	}
	return String(parseFloat(value.toFixed(2)));
}

function getCurrentQtyFromCounterForm(form) {
	const qtyButton = form.querySelector('.qty-value-btn');
	if (!qtyButton) {
		return 0;
	}
	const parsed = parseFloat((qtyButton.textContent || '0').replace(',', '.'));
	return Number.isNaN(parsed) ? 0 : parsed;
}

function updateQtyVisualInCounterForm(form, qty) {
	const safeQty = Math.max(qty, 0);
	const qtyText = formatQty(safeQty);
	const qtyButton = form.querySelector('.qty-value-btn');
	if (qtyButton) {
		qtyButton.textContent = qtyText;
	}

	const plusButton = form.querySelector('.btn-count-plus');
	if (plusButton) {
		plusButton.classList.toggle('active', safeQty > 0);
	}

	const qtyLabelBlock = form.querySelector('.qty-label-block');
	if (qtyLabelBlock) {
		const currentRightControl = form.querySelector('.btn-count-minus, .btn-remove, .btn-count-empty');
		let nextRightControl = null;

		if (safeQty > 1) {
			nextRightControl = document.createElement('button');
			nextRightControl.type = 'submit';
			nextRightControl.className = 'btn-count-minus';
			nextRightControl.name = 'action';
			nextRightControl.value = 'qty_minus';
			nextRightControl.textContent = '-';
		} else if (safeQty === 1) {
			nextRightControl = document.createElement('button');
			nextRightControl.type = 'submit';
			nextRightControl.className = 'btn-remove';
			nextRightControl.name = 'action';
			nextRightControl.value = 'qty_clear';
			nextRightControl.textContent = 'x';
		} else {
			nextRightControl = document.createElement('span');
			nextRightControl.className = 'btn-count-empty';
			nextRightControl.textContent = '-';
		}

		if (currentRightControl) {
			currentRightControl.replaceWith(nextRightControl);
		} else {
			qtyLabelBlock.insertAdjacentElement('afterend', nextRightControl);
		}
	}

	const meta = form.querySelector('.qty-meta');
	if (meta) {
		meta.textContent = meta.textContent.replace(/pedido:\s*[-\d.,]+/i, 'pedido: ' + qtyText);
	}

	if (qtyButton && qtyButton.dataset.qtyTarget) {
		const inlineForm = document.getElementById(qtyButton.dataset.qtyTarget);
		const inlineInput = inlineForm ? inlineForm.querySelector('.qty-inline-input') : null;
		if (inlineInput) {
			inlineInput.value = String(Math.round(safeQty));
		}
	}
}

function bindChecklistAsyncForms() {
	const asyncForms = document.querySelectorAll('.qty-counter-form, .qty-inline-form, .quick-add-form, .receive-form, .send-wrap');

	for (const form of asyncForms) {
		form.addEventListener('submit', async (event) => {
			if (form.dataset.forceSyncSubmit === '1') {
				delete form.dataset.forceSyncSubmit;
				return;
			}
			if ((form.method || 'POST').toUpperCase() !== 'POST') {
				return;
			}

			event.preventDefault();
			const formData = new FormData(form);
			if (event.submitter && event.submitter.name) {
				formData.set(event.submitter.name, event.submitter.value || '');
			}
			let rollback = null;
			let postSuccess = null;
			let shouldFallbackSyncSubmit = false;

			if (form.classList.contains('qty-counter-form')) {
				const action = formData.get('action') || '';
				const currentQty = getCurrentQtyFromCounterForm(form);
				let nextQty = currentQty;
				if (action === 'qty_plus') {
					nextQty = currentQty + 1;
				}
				if (action === 'qty_minus') {
					nextQty = Math.max(currentQty - 1, 0);
				}
				if (action === 'qty_clear') {
					nextQty = 0;
				}
				if (nextQty !== currentQty) {
					rollback = () => updateQtyVisualInCounterForm(form, currentQty);
					updateQtyVisualInCounterForm(form, nextQty);
				}
			}

			if (form.classList.contains('qty-inline-form')) {
				const input = form.querySelector('.qty-inline-input');
				if (input) {
					const nextQty = Math.max(parseFloat(input.value || '0') || 0, 0);
					const id = form.id;
					const counterForm = id ? form.parentElement.querySelector('.qty-counter-form') : null;
					if (counterForm) {
						const currentQty = getCurrentQtyFromCounterForm(counterForm);
						rollback = () => updateQtyVisualInCounterForm(counterForm, currentQty);
						updateQtyVisualInCounterForm(counterForm, nextQty);
					}
				}
			}

			if (form.classList.contains('quick-add-form')) {
				const actionInput = form.querySelector('input[name="action"]');
				const button = form.querySelector('button[type="submit"]');
				if (actionInput && button) {
					const sentAction = formData.get('action') || actionInput.value;
					postSuccess = () => {
						if (sentAction === 'add_item') {
							actionInput.value = 'remove_selected';
							button.className = 'btn-selected';
							button.textContent = 'ok';
						} else if (sentAction === 'remove_selected') {
							actionInput.value = 'add_item';
							button.className = 'btn-add';
							button.textContent = '+';
						}
					};
				}
			}

			if (form.classList.contains('receive-form')) {
				const checkbox = form.querySelector('input[type="checkbox"][data-auto-submit]');
				const wrapper = form.querySelector('.receive-item');
				if (checkbox && checkbox.checked) {
					const prevDisabled = checkbox.disabled;
					rollback = () => {
						checkbox.disabled = prevDisabled;
						if (wrapper) {
							wrapper.classList.remove('done');
						}
					};
					checkbox.disabled = true;
					if (wrapper) {
						wrapper.classList.add('done');
					}
				}
			}

			setFormBusy(form, true);
			try {
				await submitFormAsync(form, formData);
			} catch (error) {
				if (rollback) {
					rollback();
				}
				shouldFallbackSyncSubmit = true;
			} finally {
				setFormBusy(form, false);
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

			if (postSuccess) {
				postSuccess();
			}

			if (form.classList.contains('qty-inline-form')) {
				form.hidden = true;
				form.classList.remove('is-open');
			}
		});
	}
}

function restoreScrollFromQuery() {
	const params = new URLSearchParams(window.location.search);
	const y = parseInt(params.get('scroll_y') || '', 10);
	if (Number.isNaN(y)) {
		return;
	}
	window.scrollTo({ top: Math.max(y, 0), behavior: 'auto' });
}

function bindScrollPersistence() {
	const forms = document.querySelectorAll('.preserve-scroll-form');
	for (const form of forms) {
		form.addEventListener('submit', () => {
			let input = form.querySelector('input[name="scroll_y"]');
			if (!input) {
				input = document.createElement('input');
				input.type = 'hidden';
				input.name = 'scroll_y';
				form.appendChild(input);
			}
			input.value = String(Math.max(window.scrollY || 0, 0));
		});
	}
}

function setupAutocomplete() {
	const form = document.querySelector('.search-autocomplete');
	const input = document.getElementById('edit-search-input');
	const resultsBox = document.getElementById('checklist-search-results');
	if (!form || !input || !resultsBox) {
		return;
	}

	const options = Array.from(resultsBox.querySelectorAll('.search-result-option'));
	let activeIndex = -1;

	function getVisibleOptions() {
		return options.filter((option) => !option.hidden);
	}

	function setExpanded(expanded) {
		input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		resultsBox.classList.toggle('is-open', expanded);
	}

	function clearActive() {
		for (const option of options) {
			option.classList.remove('is-active');
			option.setAttribute('aria-selected', 'false');
		}
	}

	function setActive(index) {
		const visible = getVisibleOptions();
		if (!visible.length) {
			activeIndex = -1;
			clearActive();
			setExpanded(false);
			return;
		}

		activeIndex = ((index % visible.length) + visible.length) % visible.length;
		clearActive();
		const activeOption = visible[activeIndex];
		if (activeOption) {
			activeOption.classList.add('is-active');
			activeOption.setAttribute('aria-selected', 'true');
			activeOption.scrollIntoView({ block: 'nearest' });
			setExpanded(true);
		}
	}

	function filterOptions() {
		const term = normalizeText(input.value);
		if (!term) {
			for (const option of options) {
				option.hidden = true;
			}
			activeIndex = -1;
			setExpanded(false);
			clearActive();
			return;
		}

		let visibleCount = 0;
		for (const option of options) {
			const haystack = normalizeText(option.dataset.searchText);
			const show = haystack.includes(term);
			option.hidden = !show;
			if (show) {
				visibleCount += 1;
			}
		}
		activeIndex = -1;
		setExpanded(visibleCount > 0);
		clearActive();
	}

	function chooseOption(option) {
		if (!option) {
			return;
		}
		input.value = option.dataset.value || '';
		form.submit();
	}

	input.addEventListener('input', () => {
		filterOptions();
	});

	input.addEventListener('focus', () => {
		filterOptions();
	});

	input.addEventListener('keydown', (event) => {
		const visible = getVisibleOptions();
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (visible.length) {
				setActive(activeIndex + 1);
			}
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (visible.length) {
				setActive(activeIndex < 0 ? visible.length - 1 : activeIndex - 1);
			}
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			if (visible.length) {
				chooseOption(visible[activeIndex >= 0 ? activeIndex : 0]);
				return;
			}
			form.submit();
			return;
		}
		if (event.key === 'Escape') {
			setExpanded(false);
			clearActive();
		}
	});

	resultsBox.addEventListener('click', (event) => {
		const option = event.target.closest('.search-result-option');
		if (option) {
			chooseOption(option);
		}
	});

	document.addEventListener('click', (event) => {
		if (!form.contains(event.target)) {
			setExpanded(false);
			clearActive();
		}
	});

	filterOptions();
}

function bindQuantityEdit() {
	const triggerButtons = document.querySelectorAll('.qty-value-btn[data-qty-target]');
	const inlineForms = document.querySelectorAll('.qty-inline-form');

	function closeInlineEditors() {
		for (const form of inlineForms) {
			form.hidden = true;
			form.classList.remove('is-open');
		}
	}

	for (const button of triggerButtons) {
		button.addEventListener('click', () => {
			const targetId = button.dataset.qtyTarget;
			if (!targetId) {
				return;
			}
			const inlineForm = document.getElementById(targetId);
			if (!inlineForm) {
				return;
			}
			closeInlineEditors();
			inlineForm.hidden = false;
			inlineForm.classList.add('is-open');
			const input = inlineForm.querySelector('.qty-inline-input');
			if (input) {
				input.focus();
				input.select();
			}
		});
	}

	for (const form of inlineForms) {
		const input = form.querySelector('.qty-inline-input');
		if (!input) {
			continue;
		}
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				form.hidden = true;
				form.classList.remove('is-open');
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				form.submit();
			}
		});
	}

	document.addEventListener('click', (event) => {
		if (event.target.closest('.qty-inline-form, .qty-value-btn')) {
			return;
		}
		closeInlineEditors();
	});
}

function normalizeText(text) {
	return (text || '').toLowerCase().trim();
}

function applyQuickFilter(input) {
	if (!input) {
		return;
	}
	const term = normalizeText(input.value);
	const rows = document.querySelectorAll('.quick-row[data-product-text]');
	for (const row of rows) {
		const haystack = normalizeText(row.dataset.productText);
		row.style.display = !term || haystack.includes(term) ? '' : 'none';
	}
}

document.addEventListener('DOMContentLoaded', () => {
	restoreScrollFromQuery();
	bindScrollPersistence();
	bindQuantityEdit();
	setupAutocomplete();
	bindChecklistAsyncForms();

	const input = document.getElementById('edit-search-input');
	if (!input) {
		return;
	}

	applyQuickFilter(input);

	input.addEventListener('input', () => {
		applyQuickFilter(input);
	});

	input.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') {
			return;
		}
		event.preventDefault();
		applyQuickFilter(input);
		const firstVisible = document.querySelector('.quick-row[data-product-text]:not([style*="display: none"]) .quick-add-form button');
		if (firstVisible) {
			firstVisible.focus();
		}
	});
});
