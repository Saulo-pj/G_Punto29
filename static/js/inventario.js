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

const inventoryScrollKey = 'inventory.scrollY';
const inventoryOpenRowKey = 'inventory.openEditRowId';

function saveInventoryScrollPosition() {
	window.sessionStorage.setItem(inventoryScrollKey, String(window.scrollY || window.pageYOffset || 0));
}

function restoreInventoryScrollPosition() {
	const storedScrollY = window.sessionStorage.getItem(inventoryScrollKey);
	if (storedScrollY === null) {
		return;
	}

	window.sessionStorage.removeItem(inventoryScrollKey);
	const targetScrollY = Number(storedScrollY);
	if (Number.isNaN(targetScrollY)) {
		return;
	}

	window.requestAnimationFrame(() => {
		window.scrollTo(0, targetScrollY);
	});
}

function saveOpenInventoryEditRow(rowId) {
	if (!rowId) {
		window.sessionStorage.removeItem(inventoryOpenRowKey);
		return;
	}
	window.sessionStorage.setItem(inventoryOpenRowKey, rowId);
}

function restoreOpenInventoryEditRow() {
	const rowId = window.sessionStorage.getItem(inventoryOpenRowKey);
	if (!rowId) {
		return;
	}

	const row = document.getElementById(rowId);
	if (!row) {
		window.sessionStorage.removeItem(inventoryOpenRowKey);
		return;
	}

	row.classList.remove('is-hidden');
}

window.history.scrollRestoration = 'manual';
window.addEventListener('load', () => {
	restoreOpenInventoryEditRow();
	restoreInventoryScrollPosition();
});
window.addEventListener('beforeunload', saveInventoryScrollPosition);

document.addEventListener('submit', (event) => {
	const form = event.target;
	if (!(form instanceof HTMLFormElement)) {
		return;
	}

	if (!form.closest('.inventory-filters') && !form.closest('.inventory-table-wrap') && !form.closest('.inventory-create-panel')) {
		return;
	}

	if (form.classList.contains('edit-row-form')) {
		const editRow = form.closest('.inventory-edit-row');
		saveOpenInventoryEditRow(editRow ? editRow.id : '');
	} else {
		saveOpenInventoryEditRow('');
	}

	saveInventoryScrollPosition();
}, true);

document.addEventListener('click', (event) => {
	const button = event.target.closest('[data-target]');
	if (!button) {
		return;
	}

	const targetId = button.getAttribute('data-target');
	if (!targetId || !targetId.startsWith('edit-row-')) {
		return;
	}

	const targetRow = document.getElementById(targetId);
	if (!targetRow) {
		return;
	}

	const isOpen = !targetRow.classList.contains('is-hidden');
	saveOpenInventoryEditRow(isOpen ? targetId : '');
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

// El ID de producto ahora se genera automaticamente en backend.
