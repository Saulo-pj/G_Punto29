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
const inventoryEditRowKey = 'inventory.editRowId';

function saveInventoryScrollPosition() {
	window.sessionStorage.setItem(inventoryScrollKey, String(window.scrollY || window.pageYOffset || 0));
}

function restoreInventoryScrollPosition() {
	const storedEditRowId = window.sessionStorage.getItem(inventoryEditRowKey);
	if (storedEditRowId) {
		window.sessionStorage.removeItem(inventoryEditRowKey);
		const editRow = document.getElementById(storedEditRowId);
		if (editRow) {
			editRow.classList.remove('is-hidden');
			window.requestAnimationFrame(() => {
				editRow.scrollIntoView({ behavior: 'auto', block: 'center' });
			});
			return;
		}
	}

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

window.history.scrollRestoration = 'manual';
window.addEventListener('load', restoreInventoryScrollPosition);
window.addEventListener('beforeunload', saveInventoryScrollPosition);

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

	if (!form.closest('.inventory-filters') && !form.closest('.inventory-table-wrap') && !form.closest('.inventory-create-panel')) {
		return;
	}

	saveInventoryScrollPosition();
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
