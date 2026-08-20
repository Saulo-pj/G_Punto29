(function () {
    fetch('/api/horarios/trabajadores', { credentials: 'same-origin' }).then(function (response) { return response.ok ? response.json() : []; }).then(function (trabajadores) {
        var responsable = document.querySelector('input[name="responsable"]');
        if (!responsable) return;
        var lista = document.createElement('datalist');
        lista.id = document.title.indexOf('Incidencias') !== -1 ? 'agenda-trabajadores-incidencia' : 'agenda-trabajadores-merma';
        lista.innerHTML = trabajadores.map(function (item) { return '<option value="' + item.nombre.replace(/"/g, '&quot;') + '">'; }).join('');
        responsable.type = 'search';
        responsable.setAttribute('list', lista.id);
        responsable.parentNode.appendChild(lista);
    }).catch(function () {});

    var incidenceForm = document.querySelector('[data-panel="incidencia-registro"] form');
    var selectedSede = new URLSearchParams(window.location.search).get('sede');
    if (incidenceForm && selectedSede) {
        var sedeField = document.createElement('input');
        sedeField.type = 'hidden';
        sedeField.name = 'sede';
        sedeField.value = selectedSede;
        incidenceForm.appendChild(sedeField);
    }

    document.querySelectorAll('.inline-edit summary').forEach(function (summary) {
        summary.classList.add('edit-pencil');
        summary.textContent = '✏️';
        summary.title = 'Editar registro';
        summary.setAttribute('aria-label', 'Editar registro');
    });

    var lossFilter = document.querySelector('[data-panel="historial"] .filter-form');
    var singleDate = lossFilter && lossFilter.querySelector('input[name="fecha"]');
    if (singleDate) {
        singleDate.name = 'fecha_desde';
        singleDate.setAttribute('aria-label', 'Fecha desde');
        var endDate = document.createElement('input');
        endDate.type = 'date';
        endDate.name = 'fecha_hasta';
        endDate.setAttribute('aria-label', 'Fecha hasta');
        singleDate.parentNode.insertBefore(endDate, singleDate.nextSibling);
    }

    var tabs = document.querySelectorAll('.module-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (item) { item.classList.toggle('is-active', item === tab); });
            document.querySelectorAll('.module-tab-panel').forEach(function (panel) {
                panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab);
            });
        });
    });

    var productSelect = document.getElementById('merma-product');
    if (productSelect) {
        var productSearch = document.createElement('input');
        productSearch.type = 'search';
        productSearch.placeholder = 'Buscar producto por nombre...';
        productSearch.className = 'quick-product-search';
        productSelect.parentNode.insertBefore(productSearch, productSelect);
        var unit = document.getElementById('merma-unit');
        var cost = document.getElementById('merma-cost');
        var quantity = document.getElementById('merma-quantity');
        var total = document.getElementById('merma-total');
        var stock = document.getElementById('merma-stock');
        var newFields = document.getElementById('new-product-fields');
        var newName = document.querySelector('input[name="nombre_producto_nuevo"]');
        var products = [];
        function setEditable(isNew) {
            newFields.classList.toggle('is-hidden', !isNew);
            newName.required = isNew;
            unit.readOnly = !isNew;
            cost.readOnly = !isNew;
            total.readOnly = !isNew;
            stock.textContent = isNew ? 'Producto nuevo: no se descuenta stock.' : 'Selecciona un producto para ver el stock.';
        }
        productSearch.addEventListener('input', function () {
            var query = productSearch.value.toLowerCase();
            Array.from(productSelect.options).forEach(function (option) {
                option.hidden = Boolean(query) && option.value && option.textContent.toLowerCase().indexOf(query) === -1;
            });
        });
        var sedeSelect = document.getElementById('merma-sede');
        function loadProducts() {
            var url = productSelect.dataset.productsUrl;
            if (sedeSelect) url = url.split('?')[0] + '?sede=' + encodeURIComponent(sedeSelect.value);
            return fetch(url).then(function (response) { return response.json(); }).then(function (data) {
                products = data;
                productSelect.innerHTML = '<option value="">Selecciona un producto</option><option value="__nuevo__">+ Registrar producto nuevo</option>';
                products.forEach(function (item) {
                    var option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.name + ' (' + Number(item.stock).toFixed(2) + ' ' + item.unit + ')';
                    option.disabled = Number(item.stock) <= 0;
                    productSelect.appendChild(option);
                });
            });
        }
        function recalculate() {
            var selected = products.find(function (item) { return item.id === productSelect.value; });
            var amount = Number(quantity.value || 0);
            var price = selected ? Number(selected.cost || 0) : Number(cost.value || 0);
            if (selected) cost.value = price.toFixed(2);
            total.value = (amount * price).toFixed(2);
            if (selected) {
                stock.textContent = 'Stock disponible: ' + Number(selected.stock).toFixed(2) + ' ' + selected.unit;
                quantity.max = selected.stock;
            }
        }
        loadProducts().catch(function () { productSelect.innerHTML = '<option value="">No se pudo cargar inventario</option>'; });
        if (sedeSelect) sedeSelect.addEventListener('change', function () { loadProducts(); });
        productSelect.addEventListener('change', function () {
            var selected = products.find(function (item) { return item.id === productSelect.value; });
            var isNew = productSelect.value === '__nuevo__';
            setEditable(isNew);
            unit.value = selected ? selected.unit : '';
            if (isNew) { unit.value = 'unidad'; cost.value = '0.00'; }
            recalculate();
        });
        quantity.addEventListener('input', recalculate);
        unit.addEventListener('input', recalculate);
        cost.addEventListener('input', recalculate);
        setEditable(false);
    }

    var discount = document.getElementById('discount-select');
    var discountAmount = document.getElementById('discount-amount');
    if (discount && discountAmount) {
        function updateDiscount() {
            var enabled = discount.value === 'si';
            discountAmount.disabled = !enabled;
            if (!enabled) discountAmount.value = '0';
        }
        discount.addEventListener('change', updateDiscount);
        updateDiscount();
    }

    document.querySelectorAll('select[name="proceso"]').forEach(function (select) {
        function updateProcessColor() {
            select.classList.remove('process-evaluacion', 'process-visto', 'process-aprobado', 'process-desaprobada');
            select.classList.add('process-' + select.value);
        }
        select.addEventListener('change', updateProcessColor);
        updateProcessColor();
    });

    document.querySelectorAll('form.loss-form').forEach(function (form) {
        form.addEventListener('submit', function () {
            var notice = document.querySelector('[data-save-notice]');
            if (notice) { notice.textContent = 'Guardando cambios...'; notice.classList.add('is-visible'); }
        });
    });
})();
