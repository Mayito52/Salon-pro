/**
 * SalonPro Accounting - Sistema Contable y Control de Inventario en Onzas
 * Creado a medida para salones de peluquería y belleza.
 */

// Estado global y configuración por defecto
const STORAGE_KEY = 'salonpro_accounting_v1';

const DEFAULT_PRODUCTS = [
  { id: 'prod_perox_10', name: 'Peróxido de 10 Vol', category: 'peroxidos', unit: 'oz', stock: 64, minStock: 16, avgCost: 0.35, totalConsumed: 20 },
  { id: 'prod_perox_20', name: 'Peróxido de 20 Vol', category: 'peroxidos', unit: 'oz', stock: 80, minStock: 20, avgCost: 0.38, totalConsumed: 45 },
  { id: 'prod_perox_30', name: 'Peróxido de 30 Vol', category: 'peroxidos', unit: 'oz', stock: 48, minStock: 16, avgCost: 0.40, totalConsumed: 32 },
  { id: 'prod_decolorante', name: 'Polvo para Decolorar', category: 'decolorantes', unit: 'oz', stock: 35.5, minStock: 12, avgCost: 0.95, totalConsumed: 28 },
  { id: 'prod_tintes', name: 'Tintes y Coloración', category: 'tintes', unit: 'oz', stock: 45, minStock: 15, avgCost: 1.50, totalConsumed: 38 },
  { id: 'prod_queratina', name: 'Queratina Brasileña', category: 'alisados', unit: 'oz', stock: 24, minStock: 8, avgCost: 2.20, totalConsumed: 16 },
  { id: 'prod_tratamientos', name: 'Tratamientos Capilares', category: 'tratamientos', unit: 'oz', stock: 32, minStock: 10, avgCost: 1.10, totalConsumed: 22 }
];

class SalonApp {
  constructor() {
    this.data = {
      settings: {
        currency: '$',
        salonName: 'Mi Salón de Peluquería'
      },
      products: [],
      purchases: [],
      jobs: [],
      expenses: []
    };

    this.pendingConfirmCallback = null;
    this.currentJobProducts = [];

    this.init();
  }

  init() {
    this.loadFromStorage();
    this.bindEvents();
    this.renderAll();
  }

  // ================= ALMACENAMIENTO LOCAL =================
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.data = JSON.parse(stored);
      } else {
        // Cargar productos iniciales
        this.data.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
        this.saveToStorage();
      }
    } catch (e) {
      console.error('Error cargando almacenamiento:', e);
      this.data.products = JSON.parse(JSON.stringify(DEFAULT_PRODUCTS));
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('Error guardando en almacenamiento:', e);
      this.showToast('Error al guardar datos localmente', 'danger');
    }
  }

  // ================= NAVEGACIÓN Y EVENTOS =================
  bindEvents() {
    // Pestañas
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    // Fechas de hoy por defecto en modales
    const todayStr = new Date().toISOString().split('T')[0];
    const dateInputs = ['jobDate', 'purchaseDate', 'expenseDate'];
    dateInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = todayStr;
    });

    // Cerrar modales con ESC
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-backdrop:not(.hidden)');
        openModals.forEach(m => m.classList.add('hidden'));
      }
    });
  }

  switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
    const pane = document.getElementById(`tab-${tabId}`);

    if (btn) btn.classList.add('active');
    if (pane) pane.classList.add('active');

    if (tabId === 'dashboard') this.renderDashboard();
    if (tabId === 'trabajos') this.renderJobsTable();
    if (tabId === 'compras') this.renderPurchasesTable();
    if (tabId === 'inventario') this.renderInventory();
    if (tabId === 'gastos') this.renderExpenses();
  }

  renderAll() {
    this.renderDashboard();
    this.renderJobsTable();
    this.renderPurchasesTable();
    this.renderInventory();
    this.renderExpenses();
    this.checkStockAlerts();
  }

  // ================= GESTIÓN DE PRODUCTOS =================
  openNewProductModal(fromPurchase = false) {
    document.getElementById('modalProductTitle').textContent = 'Crear Nuevo Producto en Inventario';
    document.getElementById('productEditId').value = '';
    document.getElementById('productName').value = '';
    document.getElementById('productCategory').value = 'otros';
    document.getElementById('productMinStock').value = '8';
    document.getElementById('productInitialStock').value = '0';
    document.getElementById('productInitialCost').value = '0.00';

    document.getElementById('productInitialStockContainer').classList.remove('hidden');
    document.getElementById('productInitialCostContainer').classList.remove('hidden');

    this.productOpenedFromPurchase = fromPurchase;
    this.openModal('modalProduct');
  }

  openEditProductModal(id) {
    const prod = this.data.products.find(p => p.id === id);
    if (!prod) return;

    document.getElementById('modalProductTitle').textContent = 'Editar Producto';
    document.getElementById('productEditId').value = prod.id;
    document.getElementById('productName').value = prod.name;
    document.getElementById('productCategory').value = prod.category || 'otros';
    document.getElementById('productMinStock').value = prod.minStock || 8;

    // En edición ocultamos stock inicial para no alterar el cálculo de compras
    document.getElementById('productInitialStockContainer').classList.add('hidden');
    document.getElementById('productInitialCostContainer').classList.add('hidden');

    this.productOpenedFromPurchase = false;
    this.openModal('modalProduct');
  }

  handleSaveProduct(e) {
    e.preventDefault();
    const editId = document.getElementById('productEditId').value;
    const name = document.getElementById('productName').value.trim();
    const category = document.getElementById('productCategory').value;
    const minStock = parseFloat(document.getElementById('productMinStock').value) || 0;

    if (!name) {
      this.showToast('Por favor escribe un nombre de producto', 'danger');
      return;
    }

    if (editId) {
      const prod = this.data.products.find(p => p.id === editId);
      if (prod) {
        prod.name = name;
        prod.category = category;
        prod.minStock = minStock;
        this.showToast(`Producto "${name}" actualizado`, 'success');
      }
    } else {
      const initialStock = parseFloat(document.getElementById('productInitialStock').value) || 0;
      const initialCost = parseFloat(document.getElementById('productInitialCost').value) || 0;

      const newProd = {
        id: 'prod_' + Date.now(),
        name: name,
        category: category,
        unit: 'oz',
        stock: initialStock,
        minStock: minStock,
        avgCost: initialCost,
        totalConsumed: 0
      };
      this.data.products.push(newProd);
      this.showToast(`Nuevo producto "${name}" agregado con éxito`, 'success');

      if (this.productOpenedFromPurchase) {
        this.renderPurchaseProductOptions(newProd.id);
      }
    }

    this.saveToStorage();
    this.closeModal('modalProduct');
    this.renderInventory();
    this.renderDashboard();
    this.checkStockAlerts();
  }

  deleteProduct(id) {
    const prod = this.data.products.find(p => p.id === id);
    if (!prod) return;

    // Verificar si tiene compras o trabajos asociados
    const hasPurchases = this.data.purchases.some(p => p.productId === id);
    const hasJobs = this.data.jobs.some(j => (j.consumedProducts || []).some(cp => cp.productId === id));

    let msg = `¿Deseas eliminar el producto "${prod.name}"?`;
    if (hasPurchases || hasJobs) {
      msg += ` Atención: Tiene registros de compras o consumos en trabajos.`;
    }

    this.showConfirm(msg, () => {
      this.data.products = this.data.products.filter(p => p.id !== id);
      this.saveToStorage();
      this.renderInventory();
      this.renderDashboard();
      this.checkStockAlerts();
      this.showToast('Producto eliminado', 'info');
    });
  }

  renderInventory() {
    const container = document.getElementById('inventoryGrid');
    const tableBody = document.getElementById('inventoryDetailTableBody');
    if (!container || !tableBody) return;

    container.innerHTML = '';
    tableBody.innerHTML = '';

    if (this.data.products.length === 0) {
      container.innerHTML = `
        <div class="col-span-full card p-4 text-center">
          <p class="text-muted">No tienes productos en catálogo aún.</p>
          <button class="btn btn-primary mt-2" onclick="app.openNewProductModal()">+ Agregar Primer Producto</button>
        </div>
      `;
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No hay productos registrados.</td></tr>`;
      return;
    }

    const cur = this.data.settings.currency || '$';

    this.data.products.forEach(prod => {
      const stock = Number(prod.stock || 0);
      const minStock = Number(prod.minStock || 8);
      const avgCost = Number(prod.avgCost || 0);
      const totalVal = stock * avgCost;
      const consumed = Number(prod.totalConsumed || 0);

      // Nivel de stock
      let statusClass = 'stock-good';
      let statusFill = 'stock-good-fill';
      let statusLabel = 'Stock Óptimo';
      let percent = Math.min(100, Math.max(10, (stock / (minStock * 2.5)) * 100));

      if (stock <= 0) {
        statusClass = 'stock-danger';
        statusFill = 'stock-danger-fill';
        statusLabel = '¡Agotado!';
        percent = 5;
      } else if (stock <= minStock) {
        statusClass = 'stock-warn';
        statusFill = 'stock-warn-fill';
        statusLabel = 'Stock Bajo (Comprar)';
        percent = 25;
      }

      // Tarjeta de catálogo
      const card = document.createElement('div');
      card.className = 'prod-card';
      card.innerHTML = `
        <div>
          <span class="prod-badge-category">${this.formatCategoryName(prod.category)}</span>
          <h4 class="prod-title">${this.escapeHtml(prod.name)}</h4>
          <div class="prod-stock-badge">
            <span class="prod-stock-ounces ${statusClass}">${stock.toFixed(1)}</span>
            <span class="prod-stock-unit">onzas disponibles</span>
          </div>
          <div class="prod-bar">
            <div class="prod-bar-fill ${statusFill}" style="width: ${percent}%;"></div>
          </div>
          <div class="prod-meta-grid">
            <span class="prod-meta-label">Costo Promedio:</span>
            <span class="prod-meta-val">${cur}${avgCost.toFixed(2)} / oz</span>
            <span class="prod-meta-label">Valor en Almacén:</span>
            <span class="prod-meta-val">${cur}${totalVal.toFixed(2)}</span>
            <span class="prod-meta-label">Stock de Alerta:</span>
            <span class="prod-meta-val">${minStock} oz</span>
            <span class="prod-meta-label">Total Gastado:</span>
            <span class="prod-meta-val">${consumed.toFixed(1)} oz</span>
          </div>
        </div>
        <div class="prod-actions">
          <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="app.quickAddPurchase('${prod.id}')">+ Comprar</button>
          <button class="btn btn-sm btn-outline" onclick="app.openEditProductModal('${prod.id}')">Editar</button>
          <button class="btn btn-sm btn-outline text-danger" title="Eliminar" onclick="app.deleteProduct('${prod.id}')">&times;</button>
        </div>
      `;
      container.appendChild(card);

      // Fila de tabla detallada
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${this.escapeHtml(prod.name)}</strong></td>
        <td><span class="prod-badge-category">${this.formatCategoryName(prod.category)}</span></td>
        <td><strong class="${statusClass}">${stock.toFixed(2)} oz</strong></td>
        <td>${cur}${avgCost.toFixed(2)} / oz</td>
        <td><strong>${cur}${totalVal.toFixed(2)}</strong></td>
        <td>${consumed.toFixed(1)} oz</td>
        <td><span class="${statusClass} font-bold">${statusLabel}</span></td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="app.openEditProductModal('${prod.id}')">Editar</button>
          <button class="btn btn-xs btn-outline text-danger" onclick="app.deleteProduct('${prod.id}')">Eliminar</button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  }

  quickAddPurchase(productId) {
    this.openNewPurchaseModal();
    const select = document.getElementById('purchaseProductId');
    if (select) {
      select.value = productId;
      this.updatePurchaseUnitHelp();
    }
  }

  // ================= MÓDULO DE COMPRAS (PRECIOS VARIABLES Y ONZAS) =================
  openNewPurchaseModal() {
    document.getElementById('modalPurchaseTitle').textContent = 'Registrar Nueva Compra de Producto';
    document.getElementById('purchaseEditId').value = '';
    document.getElementById('purchaseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('purchaseTotalOunces').value = '';
    document.getElementById('purchasePackagesCount').value = '1';
    document.getElementById('purchaseOuncesPerPackage').value = '';
    document.getElementById('purchaseTotalCost').value = '';
    document.getElementById('purchaseSupplier').value = '';
    document.getElementById('purchaseInvoice').value = '';
    document.getElementById('purchaseNotes').value = '';

    // Modo por defecto
    const totalOzRadio = document.querySelector('input[name="purchaseEntryMode"][value="totalOunces"]');
    if (totalOzRadio) totalOzRadio.checked = true;
    this.togglePurchaseMode();

    this.renderPurchaseProductOptions();
    this.calculatePurchaseOunceCost();
    this.openModal('modalPurchase');
  }

  renderPurchaseProductOptions(selectedId = null) {
    const select = document.getElementById('purchaseProductId');
    const filterSelect = document.getElementById('filterPurchaseProduct');

    const optionsHtml = this.data.products.map(p => {
      const isSel = selectedId === p.id ? 'selected' : '';
      return `<option value="${p.id}" ${isSel}>${this.escapeHtml(p.name)} (Stock actual: ${Number(p.stock || 0).toFixed(1)} oz)</option>`;
    }).join('');

    if (select) {
      select.innerHTML = optionsHtml || '<option value="">Crea un producto primero</option>';
      this.updatePurchaseUnitHelp();
    }

    if (filterSelect) {
      filterSelect.innerHTML = `<option value="all">Todos los productos</option>` + this.data.products.map(p => {
        return `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`;
      }).join('');
    }
  }

  updatePurchaseUnitHelp() {
    const select = document.getElementById('purchaseProductId');
    if (!select || !select.value) return;
    const prod = this.data.products.find(p => p.id === select.value);
    const notice = document.getElementById('purchaseImpactNotice');
    if (prod && notice) {
      const cur = this.data.settings.currency || '$';
      notice.textContent = `Stock actual: ${prod.stock.toFixed(1)} oz. Costo promedio anterior: ${cur}${prod.avgCost.toFixed(2)}/oz.`;
    }
  }

  togglePurchaseMode() {
    const mode = document.querySelector('input[name="purchaseEntryMode"]:checked')?.value || 'totalOunces';
    const totalOzBox = document.getElementById('modeTotalOuncesContainer');
    const pkgBox = document.getElementById('modeByPackagesContainer');

    if (mode === 'totalOunces') {
      totalOzBox.classList.remove('hidden');
      pkgBox.classList.add('hidden');
    } else {
      totalOzBox.classList.add('hidden');
      pkgBox.classList.remove('hidden');
      this.calculatePurchaseFromPackages();
    }
    this.calculatePurchaseOunceCost();
  }

  calculatePurchaseFromPackages() {
    const count = parseFloat(document.getElementById('purchasePackagesCount').value) || 0;
    const ozPerPkg = parseFloat(document.getElementById('purchaseOuncesPerPackage').value) || 0;
    const totalOz = count * ozPerPkg;
    document.getElementById('purchaseTotalOunces').value = totalOz > 0 ? totalOz.toFixed(2) : '';
    this.calculatePurchaseOunceCost();
  }

  calculatePurchaseOunceCost() {
    const totalCost = parseFloat(document.getElementById('purchaseTotalCost').value) || 0;
    const totalOz = parseFloat(document.getElementById('purchaseTotalOunces').value) || 0;
    const display = document.getElementById('purchaseCalculatedCostPerOunce');
    const cur = this.data.settings.currency || '$';

    if (totalOz > 0 && totalCost > 0) {
      const costPerOz = totalCost / totalOz;
      display.textContent = `${cur}${costPerOz.toFixed(3)} / oz`;
    } else {
      display.textContent = `${cur}0.00 / oz`;
    }
  }

  handleSavePurchase(e) {
    e.preventDefault();
    const editId = document.getElementById('purchaseEditId').value;
    const date = document.getElementById('purchaseDate').value;
    const productId = document.getElementById('purchaseProductId').value;
    const totalOunces = parseFloat(document.getElementById('purchaseTotalOunces').value) || 0;
    const totalCost = parseFloat(document.getElementById('purchaseTotalCost').value) || 0;
    const supplier = document.getElementById('purchaseSupplier').value.trim();
    const invoice = document.getElementById('purchaseInvoice').value.trim();
    const notes = document.getElementById('purchaseNotes').value.trim();

    if (!productId) {
      this.showToast('Selecciona un producto para la compra', 'danger');
      return;
    }
    if (totalOunces <= 0 || totalCost <= 0) {
      this.showToast('La cantidad de onzas y el costo deben ser mayores a cero', 'danger');
      return;
    }

    const costPerOunce = totalCost / totalOunces;
    const product = this.data.products.find(p => p.id === productId);

    if (!product) {
      this.showToast('El producto seleccionado no existe', 'danger');
      return;
    }

    // Modo de ingreso (para historial)
    const mode = document.querySelector('input[name="purchaseEntryMode"]:checked')?.value;
    let presentationInfo = `${totalOunces} oz directas`;
    if (mode === 'byPackages') {
      const count = document.getElementById('purchasePackagesCount').value;
      const ozPer = document.getElementById('purchaseOuncesPerPackage').value;
      presentationInfo = `${count} bote(s) de ${ozPer} oz`;
    }

    if (editId) {
      // Revertir compra previa en stock antes de aplicar la editada
      const oldPurchase = this.data.purchases.find(p => p.id === editId);
      if (oldPurchase) {
        this.revertPurchaseStock(oldPurchase);
      }
      const pIndex = this.data.purchases.findIndex(p => p.id === editId);
      if (pIndex !== -1) {
        this.data.purchases[pIndex] = {
          id: editId,
          date,
          productId,
          productName: product.name,
          presentationInfo,
          totalOunces,
          totalCost,
          costPerOunce,
          supplier,
          invoice,
          notes
        };
      }
      this.applyPurchaseStock(this.data.purchases[pIndex]);
      this.showToast('Compra actualizada y stock recalculado', 'success');
    } else {
      const newPurchase = {
        id: 'purch_' + Date.now(),
        date,
        productId,
        productName: product.name,
        presentationInfo,
        totalOunces,
        totalCost,
        costPerOunce,
        supplier,
        invoice,
        notes
      };

      this.data.purchases.unshift(newPurchase);
      this.applyPurchaseStock(newPurchase);
      this.showToast(`Compra de ${totalOunces} oz de ${product.name} agregada al stock`, 'success');
    }

    this.saveToStorage();
    this.closeModal('modalPurchase');
    this.renderPurchasesTable();
    this.renderInventory();
    this.renderDashboard();
    this.checkStockAlerts();
  }

  // Recalcular stock y costo promedio ponderado al ingresar compra
  applyPurchaseStock(purchase) {
    const product = this.data.products.find(p => p.id === purchase.productId);
    if (!product) return;

    const currentStock = Math.max(0, Number(product.stock || 0));
    const currentAvgCost = Number(product.avgCost || 0);

    const newStock = currentStock + purchase.totalOunces;

    // Fórmula del costo promedio ponderado
    let newAvgCost = currentAvgCost;
    if (newStock > 0) {
      newAvgCost = ((currentStock * currentAvgCost) + purchase.totalCost) / newStock;
    } else {
      newAvgCost = purchase.costPerOunce;
    }

    product.stock = newStock;
    product.avgCost = Number(newAvgCost.toFixed(3));
  }

  revertPurchaseStock(purchase) {
    const product = this.data.products.find(p => p.id === purchase.productId);
    if (!product) return;

    const currentStock = Number(product.stock || 0);
    const newStock = Math.max(0, currentStock - purchase.totalOunces);

    // Ajustar costo promedio si queda stock
    if (newStock > 0) {
      const remainingValue = Math.max(0, (currentStock * product.avgCost) - purchase.totalCost);
      product.avgCost = Number((remainingValue / newStock).toFixed(3));
    }
    product.stock = newStock;
  }

  deletePurchase(id) {
    const purchase = this.data.purchases.find(p => p.id === id);
    if (!purchase) return;

    this.showConfirm(`¿Deseas eliminar esta compra de ${purchase.totalOunces} oz de ${purchase.productName}? Se descontarán las onzas del stock.`, () => {
      this.revertPurchaseStock(purchase);
      this.data.purchases = this.data.purchases.filter(p => p.id !== id);
      this.saveToStorage();
      this.renderPurchasesTable();
      this.renderInventory();
      this.renderDashboard();
      this.checkStockAlerts();
      this.showToast('Compra eliminada y stock ajustado', 'info');
    });
  }

  renderPurchasesTable() {
    const tbody = document.getElementById('purchasesTableBody');
    if (!tbody) return;

    const filterProduct = document.getElementById('filterPurchaseProduct')?.value || 'all';
    const cur = this.data.settings.currency || '$';

    let filtered = this.data.purchases;
    if (filterProduct !== 'all') {
      filtered = filtered.filter(p => p.productId === filterProduct);
    }

    tbody.innerHTML = '';

    let totalAmount = 0;
    let totalOz = 0;

    filtered.forEach(p => {
      totalAmount += p.totalCost;
      totalOz += p.totalOunces;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${this.formatDate(p.date)}</td>
        <td><strong>${this.escapeHtml(p.productName)}</strong></td>
        <td><span class="text-muted">${this.escapeHtml(p.presentationInfo || '-')}</span></td>
        <td><strong class="text-success">+${Number(p.totalOunces).toFixed(1)} oz</strong></td>
        <td><strong>${cur}${Number(p.totalCost).toFixed(2)}</strong></td>
        <td><span class="badge-cost font-bold">${cur}${Number(p.costPerOunce).toFixed(3)} / oz</span></td>
        <td>
          <div>${this.escapeHtml(p.supplier || 'Comercio')}</div>
          ${p.notes ? `<small class="text-muted">${this.escapeHtml(p.notes)}</small>` : ''}
        </td>
        <td>
          <button class="btn btn-xs btn-outline text-danger" onclick="app.deletePurchase('${p.id}')">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted p-4">No hay compras registradas con este filtro.</td></tr>`;
    }

    // Actualizar KPIs de compras
    const kpiAmount = document.getElementById('kpiTotalPurchasesAmount');
    const kpiCount = document.getElementById('kpiPurchasesCount');
    const kpiOz = document.getElementById('kpiTotalPurchasesOunces');
    const kpiAvg = document.getElementById('kpiAvgOunceCost');

    if (kpiAmount) kpiAmount.textContent = `${cur}${totalAmount.toFixed(2)}`;
    if (kpiCount) kpiCount.textContent = `${filtered.length} compra(s)`;
    if (kpiOz) kpiOz.textContent = `${totalOz.toFixed(1)} oz`;
    if (kpiAvg) {
      const avg = totalOz > 0 ? (totalAmount / totalOz) : 0;
      kpiAvg.textContent = `${cur}${avg.toFixed(3)} / oz`;
    }
  }

  // ================= MÓDULO DE TRABAJOS (CONSUMO DE ONZAS Y FINANZAS) =================
  openNewJobModal() {
    document.getElementById('modalJobTitle').textContent = 'Registrar Nuevo Trabajo de Peluquería';
    document.getElementById('jobEditId').value = '';
    document.getElementById('jobDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('jobClient').value = '';
    document.getElementById('jobService').value = '';
    document.getElementById('jobStylist').value = '';
    document.getElementById('jobCharge').value = '';
    document.getElementById('jobSalaryType').value = 'amount';
    document.getElementById('jobSalaryValue').value = '0';
    document.getElementById('jobNotes').value = '';

    this.currentJobProducts = [];
    this.renderJobProductRows();
    this.calculateJobFinancials();
    this.openModal('modalJob');
  }

  openEditJobModal(jobId) {
    const job = this.data.jobs.find(j => j.id === jobId);
    if (!job) return;

    document.getElementById('modalJobTitle').textContent = 'Editar Trabajo de Peluquería';
    document.getElementById('jobEditId').value = job.id;
    document.getElementById('jobDate').value = job.date;
    document.getElementById('jobClient').value = job.client;
    document.getElementById('jobService').value = job.service;
    document.getElementById('jobStylist').value = job.stylist || '';
    document.getElementById('jobCharge').value = job.chargedAmount;
    document.getElementById('jobSalaryType').value = job.salaryType || 'amount';
    document.getElementById('jobSalaryValue').value = job.salaryInputValue || job.salaryAmount || '0';
    document.getElementById('jobNotes').value = job.notes || '';

    // Cargar productos consumidos previamente
    this.currentJobProducts = (job.consumedProducts || []).map(cp => ({ ...cp }));
    this.renderJobProductRows();
    this.calculateJobFinancials();
    this.openModal('modalJob');
  }

  addJobProductRow(productId = '', ounces = 1) {
    if (this.data.products.length === 0) {
      this.showToast('Primero debes crear productos en el inventario', 'warning');
      return;
    }
    const defaultProdId = productId || this.data.products[0].id;
    this.currentJobProducts.push({
      productId: defaultProdId,
      ounces: ounces
    });
    this.renderJobProductRows();
    this.calculateJobFinancials();
  }

  removeJobProductRow(index) {
    this.currentJobProducts.splice(index, 1);
    this.renderJobProductRows();
    this.calculateJobFinancials();
  }

  renderJobProductRows() {
    const container = document.getElementById('jobProductsContainer');
    if (!container) return;

    container.innerHTML = '';
    const cur = this.data.settings.currency || '$';

    if (this.currentJobProducts.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted p-2 text-sm">
          No has agregado productos consumidos para este servicio aún.
          <br><button type="button" class="btn btn-xs btn-outline-info mt-1" onclick="app.addJobProductRow()">+ Agregar Peróxido, Tinte, etc.</button>
        </div>
      `;
      return;
    }

    this.currentJobProducts.forEach((item, index) => {
      const prod = this.data.products.find(p => p.id === item.productId);
      const avgCost = prod ? Number(prod.avgCost || 0) : 0;
      const oz = parseFloat(item.ounces) || 0;
      const rowCost = oz * avgCost;

      const row = document.createElement('div');
      row.className = 'job-product-row';

      const selectOptions = this.data.products.map(p => {
        const isSel = p.id === item.productId ? 'selected' : '';
        return `<option value="${p.id}" ${isSel}>${this.escapeHtml(p.name)} (${cur}${Number(p.avgCost).toFixed(2)}/oz)</option>`;
      }).join('');

      row.innerHTML = `
        <div>
          <select class="form-control form-control-sm" onchange="app.updateJobProductRowProduct(${index}, this.value)">
            ${selectOptions}
          </select>
        </div>
        <div>
          <div class="flex-row gap-2">
            <input type="number" step="0.1" min="0.1" class="form-control form-control-sm" value="${item.ounces}" 
                   placeholder="Onzas" oninput="app.updateJobProductRowOunces(${index}, this.value)">
            <span class="text-xs font-bold text-muted">oz</span>
          </div>
        </div>
        <div class="job-product-cost-badge">
          Costó: <strong>${cur}${rowCost.toFixed(2)}</strong>
        </div>
        <div>
          <button type="button" class="btn btn-xs btn-outline text-danger" title="Quitar" onclick="app.removeJobProductRow(${index})">&times;</button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  updateJobProductRowProduct(index, newProductId) {
    if (this.currentJobProducts[index]) {
      this.currentJobProducts[index].productId = newProductId;
      this.renderJobProductRows();
      this.calculateJobFinancials();
    }
  }

  updateJobProductRowOunces(index, value) {
    if (this.currentJobProducts[index]) {
      this.currentJobProducts[index].ounces = parseFloat(value) || 0;
      this.calculateJobFinancials();
      // Actualizar etiqueta de costo sin redibujar todo el input
      const prod = this.data.products.find(p => p.id === this.currentJobProducts[index].productId);
      const cur = this.data.settings.currency || '$';
      const costBadge = document.querySelectorAll('.job-product-cost-badge')[index];
      if (costBadge && prod) {
        costBadge.innerHTML = `Costó: <strong>${cur}${(this.currentJobProducts[index].ounces * prod.avgCost).toFixed(2)}</strong>`;
      }
    }
  }

  calculateJobFinancials() {
    const cur = this.data.settings.currency || '$';
    const charged = parseFloat(document.getElementById('jobCharge')?.value) || 0;
    const salaryType = document.getElementById('jobSalaryType')?.value || 'amount';
    const salaryValue = parseFloat(document.getElementById('jobSalaryValue')?.value) || 0;

    // Calcular costo de materiales consumidos
    let totalMaterialCost = 0;
    this.currentJobProducts.forEach(item => {
      const prod = this.data.products.find(p => p.id === item.productId);
      const oz = parseFloat(item.ounces) || 0;
      if (prod && oz > 0) {
        totalMaterialCost += (oz * Number(prod.avgCost || 0));
      }
    });

    // Calcular salario
    let calculatedSalary = 0;
    if (salaryType === 'percent') {
      calculatedSalary = (charged * salaryValue) / 100;
    } else {
      calculatedSalary = salaryValue;
    }

    // Ganancia / Mano de Obra del Salón
    const salonProfit = charged - totalMaterialCost - calculatedSalary;

    // Actualizar UI
    const materialCostDisplay = document.getElementById('jobTotalMaterialCostDisplay');
    if (materialCostDisplay) materialCostDisplay.textContent = `${cur}${totalMaterialCost.toFixed(2)}`;

    const splitCharged = document.getElementById('splitCharged');
    const splitMaterial = document.getElementById('splitMaterial');
    const splitSalary = document.getElementById('splitSalary');
    const splitProfit = document.getElementById('splitProfit');

    if (splitCharged) splitCharged.textContent = `${cur}${charged.toFixed(2)}`;
    if (splitMaterial) splitMaterial.textContent = `${cur}${totalMaterialCost.toFixed(2)}`;
    if (splitSalary) splitSalary.textContent = `${cur}${calculatedSalary.toFixed(2)}`;
    if (splitProfit) {
      splitProfit.textContent = `${cur}${salonProfit.toFixed(2)}`;
      splitProfit.className = salonProfit >= 0 ? 'split-amount text-success' : 'split-amount text-danger';
    }

    return {
      charged,
      totalMaterialCost,
      calculatedSalary,
      salonProfit
    };
  }

  handleSaveJob(e) {
    e.preventDefault();
    const editId = document.getElementById('jobEditId').value;
    const date = document.getElementById('jobDate').value;
    const client = document.getElementById('jobClient').value.trim();
    const service = document.getElementById('jobService').value.trim();
    const stylist = document.getElementById('jobStylist').value.trim();
    const salaryType = document.getElementById('jobSalaryType').value;
    const salaryInputValue = parseFloat(document.getElementById('jobSalaryValue').value) || 0;
    const notes = document.getElementById('jobNotes').value.trim();

    if (!client || !service) {
      this.showToast('Por favor completa el nombre de la clienta y el servicio', 'danger');
      return;
    }

    const financials = this.calculateJobFinancials();
    if (financials.charged <= 0) {
      this.showToast('El cobro a la clienta debe ser mayor a 0', 'danger');
      return;
    }

    // Preparar lista de productos consumidos con nombres y costos congelados
    const consumedProductsDetails = this.currentJobProducts
      .filter(item => parseFloat(item.ounces) > 0)
      .map(item => {
        const prod = this.data.products.find(p => p.id === item.productId);
        const costPerOz = prod ? Number(prod.avgCost || 0) : 0;
        const oz = parseFloat(item.ounces);
        return {
          productId: item.productId,
          productName: prod ? prod.name : 'Insumo',
          ounces: oz,
          costPerOunce: costPerOz,
          totalCost: oz * costPerOz
        };
      });

    if (editId) {
      // Revertir consumo de inventario del trabajo previo
      const oldJob = this.data.jobs.find(j => j.id === editId);
      if (oldJob) {
        this.revertJobConsumption(oldJob);
      }

      const jIndex = this.data.jobs.findIndex(j => j.id === editId);
      if (jIndex !== -1) {
        this.data.jobs[jIndex] = {
          id: editId,
          date,
          client,
          service,
          stylist,
          chargedAmount: financials.charged,
          materialCost: financials.totalMaterialCost,
          salaryType,
          salaryInputValue,
          salaryAmount: financials.calculatedSalary,
          salonProfit: financials.salonProfit,
          consumedProducts: consumedProductsDetails,
          notes
        };
      }
      this.applyJobConsumption(this.data.jobs[jIndex]);
      this.showToast('Trabajo actualizado y consumo de onzas ajustado', 'success');
    } else {
      const newJob = {
        id: 'job_' + Date.now(),
        date,
        client,
        service,
        stylist,
        chargedAmount: financials.charged,
        materialCost: financials.totalMaterialCost,
        salaryType,
        salaryInputValue,
        salaryAmount: financials.calculatedSalary,
        salonProfit: financials.salonProfit,
        consumedProducts: consumedProductsDetails,
        notes
      };

      this.data.jobs.unshift(newJob);
      this.applyJobConsumption(newJob);
      this.showToast(`Trabajo de "${client}" registrado con éxito`, 'success');
    }

    this.saveToStorage();
    this.closeModal('modalJob');
    this.renderJobsTable();
    this.renderInventory();
    this.renderDashboard();
    this.checkStockAlerts();
  }

  // Descontar onzas del inventario al realizar un trabajo
  applyJobConsumption(job) {
    if (!job.consumedProducts) return;
    job.consumedProducts.forEach(cp => {
      const product = this.data.products.find(p => p.id === cp.productId);
      if (product) {
        product.stock = Math.max(0, Number(product.stock || 0) - cp.ounces);
        product.totalConsumed = Number(product.totalConsumed || 0) + cp.ounces;
      }
    });
  }

  // Devolver onzas al inventario si se elimina o edita el trabajo
  revertJobConsumption(job) {
    if (!job.consumedProducts) return;
    job.consumedProducts.forEach(cp => {
      const product = this.data.products.find(p => p.id === cp.productId);
      if (product) {
        product.stock = Number(product.stock || 0) + cp.ounces;
        product.totalConsumed = Math.max(0, Number(product.totalConsumed || 0) - cp.ounces);
      }
    });
  }

  deleteJob(id) {
    const job = this.data.jobs.find(j => j.id === id);
    if (!job) return;

    this.showConfirm(`¿Deseas eliminar el trabajo de "${job.client}"? Las onzas consumidas volverán al inventario.`, () => {
      this.revertJobConsumption(job);
      this.data.jobs = this.data.jobs.filter(j => j.id !== id);
      this.saveToStorage();
      this.renderJobsTable();
      this.renderInventory();
      this.renderDashboard();
      this.checkStockAlerts();
      this.showToast('Trabajo eliminado y stock restaurado', 'info');
    });
  }

  renderJobsTable() {
    const tbody = document.getElementById('jobsTableBody');
    if (!tbody) return;

    const searchText = (document.getElementById('searchJobText')?.value || '').toLowerCase();
    const dateFrom = document.getElementById('filterJobDateFrom')?.value;
    const dateTo = document.getElementById('filterJobDateTo')?.value;
    const cur = this.data.settings.currency || '$';

    let filtered = this.data.jobs.filter(j => {
      if (searchText) {
        const matchClient = (j.client || '').toLowerCase().includes(searchText);
        const matchService = (j.service || '').toLowerCase().includes(searchText);
        const matchStylist = (j.stylist || '').toLowerCase().includes(searchText);
        if (!matchClient && !matchService && !matchStylist) return false;
      }
      if (dateFrom && j.date < dateFrom) return false;
      if (dateTo && j.date > dateTo) return false;
      return true;
    });

    tbody.innerHTML = '';

    let totalCharged = 0;
    let totalMaterial = 0;
    let totalSalaries = 0;
    let totalProfit = 0;

    filtered.forEach(job => {
      totalCharged += Number(job.chargedAmount || 0);
      totalMaterial += Number(job.materialCost || 0);
      totalSalaries += Number(job.salaryAmount || 0);
      totalProfit += Number(job.salonProfit || 0);

      // Desglose de onzas consumidas
      let consumedSummary = '<span class="text-muted text-xs">Sin consumo</span>';
      if (job.consumedProducts && job.consumedProducts.length > 0) {
        consumedSummary = job.consumedProducts.map(cp => {
          return `<span class="badge-tag">${this.escapeHtml(cp.productName)}: <strong>${cp.ounces} oz</strong></span>`;
        }).join(' ');
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${this.formatDate(job.date)}</td>
        <td><strong>${this.escapeHtml(job.client)}</strong></td>
        <td>${this.escapeHtml(job.service)}</td>
        <td>${this.escapeHtml(job.stylist || '-')}</td>
        <td>
          <div class="mb-1">${consumedSummary}</div>
          <span class="text-xs text-muted">Costo mat: ${cur}${Number(job.materialCost).toFixed(2)}</span>
        </td>
        <td><strong class="text-primary">${cur}${Number(job.chargedAmount).toFixed(2)}</strong></td>
        <td><span class="text-warning font-bold">${cur}${Number(job.salaryAmount).toFixed(2)}</span></td>
        <td><strong class="${job.salonProfit >= 0 ? 'text-success' : 'text-danger'}">${cur}${Number(job.salonProfit).toFixed(2)}</strong></td>
        <td>
          <div class="btn-group">
            <button class="btn btn-xs btn-outline" onclick="app.openEditJobModal('${job.id}')">Editar</button>
            <button class="btn btn-xs btn-outline text-danger" onclick="app.deleteJob('${job.id}')">Eliminar</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted p-4">No se encontraron trabajos con los filtros actuales.</td></tr>`;
    }

    const summaryEl = document.getElementById('jobsTotalsSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <span>Total Cobrado: <strong class="text-primary">${cur}${totalCharged.toFixed(2)}</strong></span> | 
        <span>Material: <strong class="text-danger">${cur}${totalMaterial.toFixed(2)}</strong></span> | 
        <span>Salarios: <strong class="text-warning">${cur}${totalSalaries.toFixed(2)}</strong></span> | 
        <span>Ganancia Salón: <strong class="${totalProfit >= 0 ? 'text-success' : 'text-danger'}">${cur}${totalProfit.toFixed(2)}</strong></span>
      `;
    }
  }

  resetJobFilters() {
    const s = document.getElementById('searchJobText');
    const f = document.getElementById('filterJobDateFrom');
    const t = document.getElementById('filterJobDateTo');
    if (s) s.value = '';
    if (f) f.value = '';
    if (t) t.value = '';
    this.renderJobsTable();
  }

  // ================= MÓDULO DE GASTOS DEL LOCAL =================
  openNewExpenseModal(preselectedCategory = null) {
    document.getElementById('modalExpenseTitle').textContent = 'Registrar Gasto del Local';
    document.getElementById('expenseEditId').value = '';
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expenseCategory').value = preselectedCategory || 'local';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDescription').value = '';
    document.getElementById('expensePaymentMethod').value = 'Efectivo';
    document.getElementById('expenseReceipt').value = '';

    this.openModal('modalExpense');
  }

  openEditExpenseModal(id) {
    const exp = this.data.expenses.find(e => e.id === id);
    if (!exp) return;

    document.getElementById('modalExpenseTitle').textContent = 'Editar Gasto del Local';
    document.getElementById('expenseEditId').value = exp.id;
    document.getElementById('expenseDate').value = exp.date;
    document.getElementById('expenseCategory').value = exp.category;
    document.getElementById('expenseAmount').value = exp.amount;
    document.getElementById('expenseDescription').value = exp.description;
    document.getElementById('expensePaymentMethod').value = exp.paymentMethod || 'Efectivo';
    document.getElementById('expenseReceipt').value = exp.receipt || '';

    this.openModal('modalExpense');
  }

  handleSaveExpense(e) {
    e.preventDefault();
    const editId = document.getElementById('expenseEditId').value;
    const date = document.getElementById('expenseDate').value;
    const category = document.getElementById('expenseCategory').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    const description = document.getElementById('expenseDescription').value.trim();
    const paymentMethod = document.getElementById('expensePaymentMethod').value;
    const receipt = document.getElementById('expenseReceipt').value.trim();

    if (amount <= 0 || !description) {
      this.showToast('Ingresa un monto válido y la descripción del gasto', 'danger');
      return;
    }

    if (editId) {
      const idx = this.data.expenses.findIndex(e => e.id === editId);
      if (idx !== -1) {
        this.data.expenses[idx] = {
          id: editId,
          date,
          category,
          amount,
          description,
          paymentMethod,
          receipt
        };
        this.showToast('Gasto actualizado', 'success');
      }
    } else {
      const newExp = {
        id: 'exp_' + Date.now(),
        date,
        category,
        amount,
        description,
        paymentMethod,
        receipt
      };
      this.data.expenses.unshift(newExp);
      this.showToast('Gasto registrado con éxito', 'success');
    }

    this.saveToStorage();
    this.closeModal('modalExpense');
    this.renderExpenses();
    this.renderDashboard();
  }

  deleteExpense(id) {
    const exp = this.data.expenses.find(e => e.id === id);
    if (!exp) return;

    this.showConfirm(`¿Deseas eliminar el gasto "${exp.description}" de ${this.data.settings.currency || '$'}${exp.amount}?`, () => {
      this.data.expenses = this.data.expenses.filter(e => e.id !== id);
      this.saveToStorage();
      this.renderExpenses();
      this.renderDashboard();
      this.showToast('Gasto eliminado', 'info');
    });
  }

  renderExpenses() {
    this.renderExpenseCategories();
    this.renderExpensesTable();
  }

  renderExpenseCategories() {
    const container = document.getElementById('expenseCategoriesGrid');
    if (!container) return;

    const cur = this.data.settings.currency || '$';

    const categories = [
      { id: 'local', name: 'Pago del Local (Alquiler)', icon: '🏢' },
      { id: 'gestor', name: 'Gestor / Asesoría', icon: '📋' },
      { id: 'multas', name: 'Multas y Tasas', icon: '⚠️' },
      { id: 'servicios', name: 'Luz, Agua, Gas, Net', icon: '💡' },
      { id: 'limpieza', name: 'Limpieza y Descartables', icon: '🧴' },
      { id: 'publicidad', name: 'Publicidad y Redes', icon: '📢' },
      { id: 'mantenimiento', name: 'Mantenimiento Local', icon: '🔧' },
      { id: 'otros', name: 'Otros Gastos', icon: '📦' }
    ];

    container.innerHTML = '';
    categories.forEach(cat => {
      const totalInCat = this.data.expenses
        .filter(e => e.category === cat.id)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const card = document.createElement('div');
      card.className = 'category-card';
      card.onclick = () => this.openNewExpenseModal(cat.id);
      card.innerHTML = `
        <span class="category-card-icon">${cat.icon}</span>
        <span class="category-card-name">${cat.name}</span>
        <span class="category-card-total">${cur}${totalInCat.toFixed(2)}</span>
        <span class="text-xs text-muted">+ Clic para agregar</span>
      `;
      container.appendChild(card);
    });
  }

  renderExpensesTable() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    const filterCat = document.getElementById('filterExpenseCategory')?.value || 'all';
    const cur = this.data.settings.currency || '$';

    let filtered = this.data.expenses;
    if (filterCat !== 'all') {
      filtered = filtered.filter(e => e.category === filterCat);
    }

    tbody.innerHTML = '';

    filtered.forEach(exp => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${this.formatDate(exp.date)}</td>
        <td><span class="prod-badge-category">${this.formatExpenseCategoryName(exp.category)}</span></td>
        <td>
          <strong>${this.escapeHtml(exp.description)}</strong>
          ${exp.receipt ? `<span class="text-xs text-muted block">Comprobante: ${this.escapeHtml(exp.receipt)}</span>` : ''}
        </td>
        <td>${this.escapeHtml(exp.paymentMethod || 'Efectivo')}</td>
        <td><strong class="text-danger">${cur}${Number(exp.amount).toFixed(2)}</strong></td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="app.openEditExpenseModal('${exp.id}')">Editar</button>
          <button class="btn btn-xs btn-outline text-danger" onclick="app.deleteExpense('${exp.id}')">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted p-4">No hay gastos registrados en esta categoría.</td></tr>`;
    }
  }

  // ================= PANEL DE CONTROL (DASHBOARD & GRÁFICOS) =================
  renderDashboard() {
    const period = document.getElementById('dashboardPeriod')?.value || 'month';
    const cur = this.data.settings.currency || '$';

    const dateFilterFn = (itemDate) => {
      if (period === 'all') return true;
      const d = new Date(itemDate);
      const now = new Date();

      if (period === 'today') {
        return d.toDateString() === now.toDateString();
      }
      if (period === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (period === 'lastMonth') {
        const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
      }
      if (period === 'year') {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    };

    // Filtrar colecciones por periodo
    const periodJobs = this.data.jobs.filter(j => dateFilterFn(j.date));
    const periodExpenses = this.data.expenses.filter(e => dateFilterFn(e.date));

    // Cálculos Contables
    const totalIncome = periodJobs.reduce((sum, j) => sum + Number(j.chargedAmount || 0), 0);
    const totalMaterialUsed = periodJobs.reduce((sum, j) => sum + Number(j.materialCost || 0), 0);
    const totalSalaries = periodJobs.reduce((sum, j) => sum + Number(j.salaryAmount || 0), 0);
    const totalFixedExpenses = periodExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Beneficio Neto Real del Salón en el periodo
    const netProfit = totalIncome - totalMaterialUsed - totalSalaries - totalFixedExpenses;

    // Conteo de onzas gastadas en el periodo
    let totalOuncesUsed = 0;
    periodJobs.forEach(j => {
      (j.consumedProducts || []).forEach(cp => totalOuncesUsed += Number(cp.ounces || 0));
    });

    // Inventario actual total (almacén)
    let totalStockOunces = 0;
    let totalStockValue = 0;
    this.data.products.forEach(p => {
      const s = Number(p.stock || 0);
      totalStockOunces += s;
      totalStockValue += (s * Number(p.avgCost || 0));
    });

    // Actualizar KPIs en el DOM
    const elIncome = document.getElementById('kpiIncome');
    const elJobsCount = document.getElementById('kpiIncomeJobs');
    const elMaterial = document.getElementById('kpiMaterial');
    const elOuncesUsed = document.getElementById('kpiOuncesUsed');
    const elSalaries = document.getElementById('kpiSalaries');
    const elExpenses = document.getElementById('kpiFixedExpenses');
    const elNetProfit = document.getElementById('kpiNetProfit');
    const elStockValue = document.getElementById('kpiStockValue');
    const elTotalOunces = document.getElementById('kpiTotalOunces');

    if (elIncome) elIncome.textContent = `${cur}${totalIncome.toFixed(2)}`;
    if (elJobsCount) elJobsCount.textContent = `${periodJobs.length} servicios realizados`;
    if (elMaterial) elMaterial.textContent = `${cur}${totalMaterialUsed.toFixed(2)}`;
    if (elOuncesUsed) elOuncesUsed.textContent = `${totalOuncesUsed.toFixed(1)} oz gastadas`;
    if (elSalaries) elSalaries.textContent = `${cur}${totalSalaries.toFixed(2)}`;
    if (elExpenses) elExpenses.textContent = `${cur}${totalFixedExpenses.toFixed(2)}`;
    if (elNetProfit) elNetProfit.textContent = `${cur}${netProfit.toFixed(2)}`;
    if (elStockValue) elStockValue.textContent = `${cur}${totalStockValue.toFixed(2)}`;
    if (elTotalOunces) elTotalOunces.textContent = `${totalStockOunces.toFixed(1)} oz en stock`;

    // Gráficos SVG Nativos
    this.renderDonutChart(totalIncome, totalMaterialUsed, totalSalaries, totalFixedExpenses, netProfit);
    this.renderOuncesBarChart(periodJobs);

    // Tablas rápidas de inicio
    this.renderDashboardRecentTables();
  }

  // Gráfico Donut de distribución contable (SVG puro)
  renderDonutChart(income, material, salaries, expenses, profit) {
    const container = document.getElementById('chartDistribution');
    const legend = document.getElementById('distributionLegend');
    if (!container || !legend) return;

    if (income <= 0) {
      container.innerHTML = `<div class="text-muted text-sm text-center">No hay ingresos registrados en este periodo para graficar.</div>`;
      legend.innerHTML = '';
      return;
    }

    const cur = this.data.settings.currency || '$';

    // Segmentos
    const segments = [
      { label: 'Ganancia Salón', value: Math.max(0, profit), color: '#10b981' },
      { label: 'Salarios', value: salaries, color: '#7c3aed' },
      { label: 'Materiales (oz)', value: material, color: '#f59e0b' },
      { label: 'Gastos Local', value: expenses, color: '#ef4444' }
    ];

    const total = segments.reduce((sum, s) => sum + s.value, 0) || income;

    // Calcular arcos SVG
    let currentAngle = 0;
    const cx = 100, cy = 100, r = 70, strokeWidth = 32;
    const circumference = 2 * Math.PI * r;

    let svgPaths = '';
    let offset = 0;

    segments.forEach(seg => {
      const fraction = seg.value / total;
      const strokeDash = fraction * circumference;
      const strokeGap = circumference - strokeDash;

      if (fraction > 0) {
        svgPaths += `
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}"
                  stroke-width="${strokeWidth}"
                  stroke-dasharray="${strokeDash} ${strokeGap}"
                  stroke-dashoffset="${-offset}"
                  transform="rotate(-90 ${cx} ${cy})">
          </circle>
        `;
        offset += strokeDash;
      }
    });

    container.innerHTML = `
      <svg width="200" height="200" viewBox="0 0 200 200">
        ${svgPaths}
        <text x="100" y="95" text-anchor="middle" font-size="12" fill="#6b7280" font-weight="600">TOTAL</text>
        <text x="100" y="115" text-anchor="middle" font-size="14" fill="#111827" font-weight="700">${cur}${income.toFixed(0)}</text>
      </svg>
    `;

    legend.innerHTML = segments.map(seg => {
      const pct = ((seg.value / total) * 100).toFixed(0);
      return `
        <div class="legend-item">
          <div class="legend-color" style="background:${seg.color}"></div>
          <span>${seg.label}: <strong>${cur}${seg.value.toFixed(1)}</strong> (${pct}%)</span>
        </div>
      `;
    }).join('');
  }

  // Gráfico de barras de consumo de onzas por producto
  renderOuncesBarChart(jobs) {
    const container = document.getElementById('chartOuncesBar');
    if (!container) return;

    // Sumar onzas por producto
    const usageMap = {};
    jobs.forEach(j => {
      (j.consumedProducts || []).forEach(cp => {
        usageMap[cp.productName] = (usageMap[cp.productName] || 0) + Number(cp.ounces || 0);
      });
    });

    const entries = Object.entries(usageMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (entries.length === 0) {
      container.innerHTML = `<div class="text-muted text-sm text-center">No hay registros de consumo de onzas en este periodo.</div>`;
      return;
    }

    const maxVal = Math.max(...entries.map(e => e[1])) || 1;

    let barsHtml = `<div style="width:100%; display:flex; flex-direction:column; gap:0.65rem; justify-content:center;">`;
    entries.forEach(([name, oz]) => {
      const pct = (oz / maxVal) * 100;
      barsHtml += `
        <div>
          <div class="flex-between text-xs mb-1">
            <span class="font-bold">${this.escapeHtml(name)}</span>
            <span class="text-primary font-bold">${oz.toFixed(1)} oz</span>
          </div>
          <div style="background:#e5e7eb; border-radius:999px; height:10px; width:100%; overflow:hidden;">
            <div style="background:linear-gradient(90deg, #9d5b78, #c59b6b); width:${pct}%; height:100%; border-radius:999px;"></div>
          </div>
        </div>
      `;
    });
    barsHtml += `</div>`;

    container.innerHTML = barsHtml;
  }

  renderDashboardRecentTables() {
    // Últimos 4 trabajos
    const jobsTable = document.querySelector('#recentJobsTable tbody');
    if (jobsTable) {
      const recent = this.data.jobs.slice(0, 4);
      const cur = this.data.settings.currency || '$';
      jobsTable.innerHTML = recent.map(j => `
        <tr>
          <td>${this.formatDate(j.date)}</td>
          <td><strong>${this.escapeHtml(j.client)}</strong> <small class="text-muted block">${this.escapeHtml(j.service)}</small></td>
          <td><strong class="text-primary">${cur}${Number(j.chargedAmount).toFixed(2)}</strong></td>
          <td>${cur}${Number(j.materialCost).toFixed(2)}</td>
          <td>${cur}${Number(j.salaryAmount).toFixed(2)}</td>
          <td><strong class="${j.salonProfit >= 0 ? 'text-success' : 'text-danger'}">${cur}${Number(j.salonProfit).toFixed(2)}</strong></td>
        </tr>
      `).join('');
      if (recent.length === 0) {
        jobsTable.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Aún no hay trabajos registrados.</td></tr>`;
      }
    }

    // Resumen de stock
    const stockTable = document.querySelector('#quickStockTable tbody');
    if (stockTable) {
      const cur = this.data.settings.currency || '$';
      stockTable.innerHTML = this.data.products.slice(0, 5).map(p => {
        const s = Number(p.stock || 0);
        const min = Number(p.minStock || 8);
        const cost = Number(p.avgCost || 0);
        const val = s * cost;
        const isLow = s <= min;
        return `
          <tr>
            <td><strong>${this.escapeHtml(p.name)}</strong></td>
            <td><strong class="${isLow ? 'text-danger' : 'text-success'}">${s.toFixed(1)} oz</strong></td>
            <td>${cur}${cost.toFixed(2)}</td>
            <td>${cur}${val.toFixed(2)}</td>
            <td><span class="${isLow ? 'badge-cost text-xs' : 'text-xs text-success'} font-bold">${isLow ? 'Pocas oz' : 'OK'}</span></td>
          </tr>
        `;
      }).join('');
      if (this.data.products.length === 0) {
        stockTable.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No hay productos.</td></tr>`;
      }
    }
  }

  checkStockAlerts() {
    const lowStockProds = this.data.products.filter(p => Number(p.stock || 0) <= Number(p.minStock || 8));
    const banner = document.getElementById('stockAlertBanner');
    const text = document.getElementById('stockAlertText');

    if (!banner || !text) return;

    if (lowStockProds.length > 0) {
      const names = lowStockProds.map(p => `${p.name} (${Number(p.stock).toFixed(1)} oz)`).join(', ');
      text.textContent = `Atención: Hay ${lowStockProds.length} producto(s) con pocas onzas: ${names}`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  // ================= RESPALDOS Y EXPORTACIONES =================
  downloadBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data, null, 2));
    const dlAnchorElem = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `salonpro_respaldo_${dateStr}.json`);
    dlAnchorElem.click();
    this.showToast('Copia de seguridad descargada con éxito', 'success');
  }

  restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.products && parsed.purchases && parsed.jobs && parsed.expenses) {
          this.data = parsed;
          this.saveToStorage();
          this.renderAll();
          this.showToast('¡Copia de seguridad restaurada correctamente!', 'success');
        } else {
          this.showToast('El archivo no tiene el formato contable válido de SalonPro', 'danger');
        }
      } catch (err) {
        this.showToast('Error al procesar el archivo JSON', 'danger');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  exportToCSV(type) {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM para compatibilidad con Excel
    const cur = this.data.settings.currency || '$';

    if (type === 'trabajos') {
      csvContent += "Fecha,Clienta,Servicio,Estilista,Cobrado,CostoMaterial,Salario,GananciaSalon,ProductosConsumidos\n";
      this.data.jobs.forEach(j => {
        const prods = (j.consumedProducts || []).map(cp => `${cp.productName}: ${cp.ounces}oz`).join(' | ');
        csvContent += `"${j.date}","${j.client}","${j.service}","${j.stylist || ''}",${j.chargedAmount},${j.materialCost},${j.salaryAmount},${j.salonProfit},"${prods}"\n`;
      });
    } else if (type === 'compras') {
      csvContent += "Fecha,Producto,Presentacion,TotalOnzas,PrecioTotalPagado,CostoPorOnza,Proveedor,Factura,Notas\n";
      this.data.purchases.forEach(p => {
        csvContent += `"${p.date}","${p.productName}","${p.presentationInfo || ''}",${p.totalOunces},${p.totalCost},${p.costPerOunce},"${p.supplier || ''}","${p.invoice || ''}","${p.notes || ''}"\n`;
      });
    } else if (type === 'gastos') {
      csvContent += "Fecha,Categoria,Descripcion,MetodoPago,Comprobante,Monto\n";
      this.data.expenses.forEach(e => {
        csvContent += `"${e.date}","${this.formatExpenseCategoryName(e.category)}","${e.description}","${e.paymentMethod || ''}","${e.receipt || ''}",${e.amount}\n`;
      });
    } else if (type === 'inventario') {
      csvContent += "Producto,Categoria,StockActualOnzas,StockMinimoAlerta,CostoPromedioPorOnza,ValorTotalAlmacen,TotalOnzasConsumidas\n";
      this.data.products.forEach(p => {
        const val = (p.stock || 0) * (p.avgCost || 0);
        csvContent += `"${p.name}","${this.formatCategoryName(p.category)}",${p.stock},${p.minStock},${p.avgCost},${val.toFixed(2)},${p.totalConsumed || 0}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `salon_${type}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast(`Archivo CSV de ${type} descargado para Excel`, 'success');
  }

  loadDemoData() {
    this.showConfirm('¿Cargar datos de ejemplo realistas de peluquería? Se complementarán con tus datos.', () => {
      const today = new Date();
      const fmt = (daysAgo) => {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
      };

      // Compras de ejemplo
      this.data.purchases = [
        {
          id: 'purch_demo_1',
          date: fmt(15),
          productId: 'prod_perox_20',
          productName: 'Peróxido de 20 Vol',
          presentationInfo: '2 botes de 32 oz',
          totalOunces: 64,
          totalCost: 24.00,
          costPerOunce: 0.375,
          supplier: 'Cosméticos Pro',
          invoice: 'FAC-901',
          notes: 'Compra mayorista'
        },
        {
          id: 'purch_demo_2',
          date: fmt(12),
          productId: 'prod_decolorante',
          productName: 'Polvo para Decolorar',
          presentationInfo: '1 bote de 35 oz',
          totalOunces: 35,
          totalCost: 32.50,
          costPerOunce: 0.928,
          supplier: 'Distribuidora Capilar',
          invoice: 'FAC-945',
          notes: 'Polvo azul anti-amarillo'
        },
        {
          id: 'purch_demo_3',
          date: fmt(10),
          productId: 'prod_queratina',
          productName: 'Queratina Brasileña',
          presentationInfo: '1 botella de 32 oz',
          totalOunces: 32,
          totalCost: 68.00,
          costPerOunce: 2.125,
          supplier: 'Liss Beauty',
          invoice: 'FAC-102',
          notes: 'Fórmula sin formol'
        }
      ];

      // Trabajos de ejemplo
      this.data.jobs = [
        {
          id: 'job_demo_1',
          date: fmt(3),
          client: 'Camila Morales',
          service: 'Balayage Rubio Cenizo + Matiz',
          stylist: 'Laura',
          chargedAmount: 95.00,
          materialCost: 8.45,
          salaryType: 'percent',
          salaryInputValue: 35,
          salaryAmount: 33.25,
          salonProfit: 53.30,
          consumedProducts: [
            { productId: 'prod_perox_20', productName: 'Peróxido de 20 Vol', ounces: 4.5, costPerOunce: 0.38, totalCost: 1.71 },
            { productId: 'prod_decolorante', productName: 'Polvo para Decolorar', ounces: 2.5, costPerOunce: 0.95, totalCost: 2.38 },
            { productId: 'prod_tintes', productName: 'Tintes y Coloración', ounces: 2.0, costPerOunce: 1.50, totalCost: 3.00 },
            { productId: 'prod_tratamientos', productName: 'Tratamientos Capilares', ounces: 1.2, costPerOunce: 1.10, totalCost: 1.36 }
          ],
          notes: 'Clienta encantada con el matizado ceniza.'
        },
        {
          id: 'job_demo_2',
          date: fmt(2),
          client: 'Beatriz Soler',
          service: 'Alisado de Queratina + Lavado',
          stylist: 'Laura',
          chargedAmount: 80.00,
          materialCost: 8.80,
          salaryType: 'amount',
          salaryInputValue: 25,
          salaryAmount: 25.00,
          salonProfit: 46.20,
          consumedProducts: [
            { productId: 'prod_queratina', productName: 'Queratina Brasileña', ounces: 4.0, costPerOunce: 2.20, totalCost: 8.80 }
          ],
          notes: 'Cabello largo y con volumen.'
        },
        {
          id: 'job_demo_3',
          date: fmt(1),
          client: 'Mariana Pérez',
          service: 'Retoque de Tinte Raíz + Tratamiento',
          stylist: 'Ana',
          chargedAmount: 45.00,
          materialCost: 4.85,
          salaryType: 'percent',
          salaryInputValue: 30,
          salaryAmount: 13.50,
          salonProfit: 26.65,
          consumedProducts: [
            { productId: 'prod_perox_20', productName: 'Peróxido de 20 Vol', ounces: 2.0, costPerOunce: 0.38, totalCost: 0.76 },
            { productId: 'prod_tintes', productName: 'Tintes y Coloración', ounces: 2.0, costPerOunce: 1.50, totalCost: 3.00 },
            { productId: 'prod_tratamientos', productName: 'Tratamientos Capilares', ounces: 1.0, costPerOunce: 1.10, totalCost: 1.09 }
          ],
          notes: 'Color castaño medio 5.1'
        }
      ];

      // Gastos del local de ejemplo
      this.data.expenses = [
        {
          id: 'exp_demo_1',
          date: fmt(12),
          category: 'local',
          amount: 450.00,
          description: 'Alquiler mensual del local de peluquería',
          paymentMethod: 'Transferencia',
          receipt: 'REC-LOC-NOV'
        },
        {
          id: 'exp_demo_2',
          date: fmt(8),
          category: 'gestor',
          amount: 75.00,
          description: 'Honorarios del gestor contable y fiscal',
          paymentMethod: 'Transferencia',
          receipt: 'FAC-GEST-44'
        },
        {
          id: 'exp_demo_3',
          date: fmt(6),
          category: 'servicios',
          amount: 68.50,
          description: 'Factura de luz eléctrica (secadores y climas)',
          paymentMethod: 'Tarjeta',
          receipt: 'ELEC-987'
        },
        {
          id: 'exp_demo_4',
          date: fmt(4),
          category: 'limpieza',
          amount: 28.00,
          description: 'Caja de toallas descartables, guantes de nitrilo y capas',
          paymentMethod: 'Efectivo',
          receipt: 'TKT-334'
        }
      ];

      this.saveToStorage();
      this.renderAll();
      this.showToast('¡Datos de demostración cargados! Revisa el Panel General.', 'success');
      this.switchTab('dashboard');
    });
  }

  clearAllData() {
    this.showConfirm('⚠️ ATENCIÓN: ¿Seguro que deseas borrar todos los trabajos, compras y gastos? Empezarás de cero en blanco.', () => {
      this.data = {
        settings: {
          currency: '$',
          salonName: 'Mi Salón de Peluquería'
        },
        products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
        purchases: [],
        jobs: [],
        expenses: []
      };
      this.saveToStorage();
      this.renderAll();
      this.showToast('Se han restablecido los datos en blanco', 'info');
      this.switchTab('dashboard');
    });
  }

  updateCurrency(newCur) {
    this.data.settings.currency = newCur.trim() || '$';
    this.saveToStorage();
    this.renderAll();
    this.showToast(`Moneda cambiada a ${this.data.settings.currency}`, 'info');
  }

  updateSalonName(name) {
    this.data.settings.salonName = name.trim() || 'Mi Salón';
    this.saveToStorage();
    this.showToast('Nombre del salón guardado', 'info');
  }

  // ================= MODAL HELPERS =================
  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  showConfirm(message, callback) {
    this.pendingConfirmCallback = callback;
    const msgEl = document.getElementById('confirmMessage');
    if (msgEl) msgEl.textContent = message;
    this.openModal('modalConfirm');
  }

  closeConfirm(confirmed) {
    this.closeModal('modalConfirm');
    if (confirmed && typeof this.pendingConfirmCallback === 'function') {
      this.pendingConfirmCallback();
    }
    this.pendingConfirmCallback = null;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ================= UTILIDADES =================
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  formatCategoryName(cat) {
    const map = {
      peroxidos: 'Peróxidos',
      decolorantes: 'Decolorantes',
      tintes: 'Tintes',
      alisados: 'Alisados / Keratina',
      tratamientos: 'Tratamientos',
      shampoo: 'Shampoo / Lavado',
      otros: 'Otros Insumos'
    };
    return map[cat] || cat || 'General';
  }

  formatExpenseCategoryName(cat) {
    const map = {
      local: 'Alquiler del Local',
      gestor: 'Gestor Contable',
      multas: 'Multas y Tasas',
      servicios: 'Servicios Básicos',
      limpieza: 'Limpieza y Descartables',
      publicidad: 'Publicidad / Redes',
      mantenimiento: 'Mantenimiento',
      otros: 'Otros Gastos'
    };
    return map[cat] || cat || 'Gastos';
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Instanciar aplicación al cargar la ventana
let app;
window.addEventListener('DOMContentLoaded', () => {
  app = new SalonApp();
});
