document.addEventListener('click', (event) => {
	const button = event.target.closest('[data-target]');
	if (!button) {
		return;
	}

	const targetId = button.getAttribute('data-target');
	const target = document.getElementById(targetId);
	if (!target) {
		return;
	}

	target.classList.toggle('is-hidden');
	if (target.id === 'inventory-create-panel') {
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
});

const areaOptions = window.INVENTORY_AREA_OPTIONS || {
	cocina: ['cocina_caliente', 'cocina_fria', 'lavadero', 'mise_en_place'],
	sala: ['sala'],
};

function buildSubareaOptions(areaSelect, subareaSelect) {
	if (!areaSelect || !subareaSelect) {
		return;
	}

	const area = (areaSelect.value || 'cocina').toLowerCase();
	const options = areaOptions[area] || [];
	const current = (subareaSelect.dataset.current || '').toLowerCase();
	const previous = (subareaSelect.value || '').toLowerCase();
	const selected = options.includes(previous) ? previous : (options.includes(current) ? current : options[0] || '');

	subareaSelect.innerHTML = '';
	if (options.length === 0) {
		const option = document.createElement('option');
		option.value = '';
		option.textContent = 'Primero crea subareas';
		option.disabled = true;
		option.selected = true;
		subareaSelect.appendChild(option);
		return;
	}
	for (const optionValue of options) {
		const option = document.createElement('option');
		option.value = optionValue;
		option.textContent = optionValue;
		if (optionValue === selected) {
			option.selected = true;
		}
		subareaSelect.appendChild(option);
	}
}

function wireAreaSubareaSelectors() {
	const areaSelects = document.querySelectorAll('.area-select');
	for (const areaSelect of areaSelects) {
		const targetId = areaSelect.dataset.subareaTarget;
		const subareaSelect = targetId ? document.getElementById(targetId) : null;
		if (!subareaSelect) {
			continue;
		}
		buildSubareaOptions(areaSelect, subareaSelect);
		areaSelect.addEventListener('change', () => buildSubareaOptions(areaSelect, subareaSelect));
	}
}

wireAreaSubareaSelectors();

function wireLiveProductSearch() {
	const productOptions = window.INVENTORY_PRODUCT_OPTIONS || [];
	const widgets = document.querySelectorAll('[data-live-product-search]');

	for (const widget of widgets) {
		const input = widget.querySelector('.product-search-input');
		const results = widget.querySelector('.product-search-results');
		if (!input || !results) {
			continue;
		}

		function hideResults() {
			results.classList.add('is-hidden');
		}

		function showResults() {
			results.classList.remove('is-hidden');
		}

		function renderResults(query) {
			const normalized = (query || '').trim().toLowerCase();
			results.innerHTML = '';

			if (!normalized) {
				hideResults();
				return;
			}

			const matches = productOptions.filter((product) => {
				return product.id.toLowerCase().includes(normalized) || product.name.toLowerCase().includes(normalized) || product.label.toLowerCase().includes(normalized);
			}).slice(0, 8);

			if (matches.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'product-search-empty';
				empty.textContent = 'Sin coincidencias';
				results.appendChild(empty);
				showResults();
				return;
			}

			for (const product of matches) {
				const option = document.createElement('button');
				option.type = 'button';
				option.className = 'product-search-item';
				option.textContent = product.label;
				option.addEventListener('click', () => {
					input.value = product.id;
					hideResults();
				});
				results.appendChild(option);
			}

			showResults();
		}

		input.addEventListener('input', () => renderResults(input.value));
		input.addEventListener('focus', () => {
			if (input.value.trim()) {
				renderResults(input.value);
			}
		});
		input.addEventListener('blur', () => {
			window.setTimeout(hideResults, 150);
		});
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				hideResults();
			}
		});

		document.addEventListener('click', (event) => {
			if (!event.target.closest('[data-live-product-search]')) {
				hideResults();
			}
		});
	}
}

wireLiveProductSearch();
