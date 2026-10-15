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
	if (target.classList.contains('inventory-edit-row')) hydrateInventoryRow(target);

	target.classList.toggle('is-hidden');
	if (target.id === 'inventory-create-panel') {
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
});

const inventoryEditRowKey = 'inventory.editRowId';

function restoreInventoryScrollPosition() {
	const storedEditRowId = window.sessionStorage.getItem(inventoryEditRowKey);
	if (storedEditRowId) {
		window.sessionStorage.removeItem(inventoryEditRowKey);
		const editRow = document.getElementById(storedEditRowId);
		if (editRow) {
			const anchorRow = editRow.previousElementSibling || editRow;
			window.requestAnimationFrame(() => {
				anchorRow.scrollIntoView({ behavior: 'auto', block: 'center' });
			});
			return;
		}
	}
}

window.history.scrollRestoration = 'manual';
window.addEventListener('load', restoreInventoryScrollPosition);

document.addEventListener('submit', (event) => {
	const form = event.target;
	if (!(form instanceof HTMLFormElement)) {
		return;
	}

	if (form.classList.contains('edit-row-form')) {
		const editRow = form.closest('.inventory-edit-row');
		if (editRow && editRow.id) {
			window.sessionStorage.setItem(inventoryEditRowKey, editRow.id);
		}
	}
}, true);

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

function hydrateInventoryRow(row) {
	if (row.dataset.hydrated) return;
	const catalogs = window.INVENTORY_CATALOG || {};
	for (const select of row.querySelectorAll('[data-catalog]')) {
		const values = [...(catalogs[select.dataset.catalog] || [])];
		const current = select.dataset.current || '';
		if (current && !values.includes(current)) values.unshift(current);
		for (const value of values) {
			const option = document.createElement('option');
			option.value = value; option.textContent = value;
			select.appendChild(option);
		}
		if (current) select.value = current;
	}
	row.dataset.hydrated = '1';
	wireAreaSubareaSelectors(row);
}

function wireAreaSubareaSelectors(root = document) {
	const areaSelects = root.querySelectorAll('.area-select');
	for (const areaSelect of areaSelects) {
		const editRow = areaSelect.closest('.inventory-edit-row');
		if (editRow && !editRow.dataset.hydrated) continue;
		if (areaSelect.dataset.wired) continue;
		const targetId = areaSelect.dataset.subareaTarget;
		const subareaSelect = targetId ? document.getElementById(targetId) : null;
		if (!subareaSelect) {
			continue;
		}
		buildSubareaOptions(areaSelect, subareaSelect);
		areaSelect.dataset.wired = '1';
		areaSelect.addEventListener('change', () => buildSubareaOptions(areaSelect, subareaSelect));
	}
}

wireAreaSubareaSelectors();

// El ID de producto ahora se genera automaticamente en backend.
