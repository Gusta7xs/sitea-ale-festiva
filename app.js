const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const storage = {
  users: () => JSON.parse(localStorage.getItem("festiva_users") || "{}"),
  saveUsers: (v) => localStorage.setItem("festiva_users", JSON.stringify(v)),
  session: () => localStorage.getItem("festiva_session"),
  setSession: (u) => localStorage.setItem("festiva_session", u),
  clearSession: () => localStorage.removeItem("festiva_session")
};

const state = { current: null, viewingStore: null };

function init() {
  bindAuth();
  bindTabs();
  bindProduct();
  bindOrdersSearch();
  bindPayment();
  handleRoute();
}

function handleRoute() {
  const url = new URL(window.location.href);
  const loja = url.searchParams.get("loja");
  if (loja) return renderPublicStore(loja);
  const session = storage.session();
  if (session) {
    const user = storage.users()[session];
    if (user) return loginUser(session);
  }
}

function bindAuth() {
  $("#registerForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const users = storage.users();
    const username = String(fd.get("username")).trim().toLowerCase();
    if (users[username]) return alert("Usuário já existe.");
    users[username] = {
      storeName: fd.get("storeName"), password: fd.get("password"), phone: fd.get("phone"), pixKey: fd.get("pixKey"),
      products: [], orders: [], createdAt: new Date().toISOString()
    };
    storage.saveUsers(users);
    e.target.reset();
    alert("Conta criada com sucesso!");
  };

  $("#loginForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const username = String(fd.get("username")).trim().toLowerCase();
    const user = storage.users()[username];
    if (!user || user.password !== fd.get("password")) return alert("Login inválido.");
    loginUser(username);
  };

  $("#logoutBtn").onclick = () => { storage.clearSession(); location.href = location.pathname; };
}

function loginUser(username) {
  state.current = username;
  storage.setSession(username);
  $("#authSection").classList.add("hidden");
  $("#dashboardSection").classList.remove("hidden");
  $("#sessionInfo").textContent = `Logado como @${username}`;
  renderDashboard();
}

function bindTabs() {
  $$(".tab").forEach(btn => btn.onclick = () => {
    $$(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    ["geral", "produtos", "pedidos", "vendas"].forEach(id => {
      $(`#${id}Panel`).classList.toggle("hidden", id !== btn.dataset.tab);
    });
  });
}

function currentUserData() { return storage.users()[state.current]; }
function persistCurrent(data) {
  const users = storage.users();
  users[state.current] = data;
  storage.saveUsers(users);
}

function renderDashboard() {
  const user = currentUserData();
  const paidOrders = user.orders.filter(o => o.receiptValid);
  const total = paidOrders.reduce((acc, o) => acc + o.price, 0);
  $("#overview").innerHTML = `<p>Produtos: <b>${user.products.length}</b></p><p>Pedidos: <b>${user.orders.length}</b></p><p>Vendas confirmadas: <b>R$ ${total.toFixed(2)}</b></p>`;
  $("#publicStoreUrl").textContent = `${location.origin}${location.pathname}?loja=${state.current}`;
  renderProducts();
  renderOrders();
  renderSales();
}

function bindProduct() {
  $("#productForm").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const user = currentUserData();
    user.products.unshift({
      id: crypto.randomUUID(),
      name: fd.get("name"), category: fd.get("category"), subCategory: fd.get("subCategory"),
      price: Number(fd.get("price")), image: fd.get("image"), description: fd.get("description"),
      createdAt: new Date().toISOString()
    });
    persistCurrent(user);
    e.target.reset();
    renderDashboard();
  };
}

function renderProducts() {
  const user = currentUserData();
  $("#productList").innerHTML = user.products.map(p => `<li>
      <div><b>${p.name}</b> - R$ ${p.price.toFixed(2)}<br><small>${p.category} / ${p.subCategory} • criado em ${new Date(p.createdAt).toLocaleString("pt-BR")}</small></div>
      <button class="delete-btn" onclick="deleteProduct('${p.id}')">🗑</button>
    </li>`).join("") || "<li>Nenhum produto cadastrado.</li>";
}

window.deleteProduct = (id) => {
  const user = currentUserData();
  const pass = prompt("Confirme sua senha para excluir este produto:");
  if (pass !== user.password) return alert("Senha incorreta. Exclusão cancelada.");
  user.products = user.products.filter(p => p.id !== id);
  persistCurrent(user);
  renderDashboard();
};

function renderOrders() {
  const user = currentUserData();
  const filter = $("#orderSearch").value.trim();
  const orders = user.orders.filter(o => !filter || o.id.includes(filter));
  $("#orderList").innerHTML = orders.map(o => `<li>
    <div>
      <b>Pedido #${o.id}</b> (${o.productName}) - R$ ${o.price.toFixed(2)}<br>
      <small>${o.email} | ${o.contact} | ${o.theme} | ${o.gender} | ${o.age} anos | ${o.notes || "Sem observações"}</small><br>
      <small>Status comprovante: ${o.receiptValid ? "Validado" : "Pendente"}</small>
    </div>
    <button onclick="alert('Contato: ${o.contact}\\nEmail: ${o.email}\\nTema: ${o.theme}\\nObs: ${o.notes || "-"}')">Mostrar informações</button>
  </li>`).join("") || "<li>Nenhum pedido recebido.</li>";
}
function bindOrdersSearch() { $("#orderSearch").oninput = renderOrders; }

function renderSales() {
  const user = currentUserData();
  const paid = user.orders.filter(o => o.receiptValid);
  const total = paid.reduce((s, o) => s + o.price, 0);
  $("#salesSummary").innerHTML = `<p>Total vendido: <b>R$ ${total.toFixed(2)}</b></p><p>Pedidos pagos: <b>${paid.length}</b></p>`;

  const ctx = $("#salesChart").getContext("2d");
  ctx.clearRect(0,0,400,220);
  const byProduct = {};
  paid.forEach(o => byProduct[o.productName] = (byProduct[o.productName] || 0) + o.price);
  const entries = Object.entries(byProduct);
  const barW = 320 / Math.max(entries.length, 1);
  const max = Math.max(...entries.map(([,v]) => v), 1);
  entries.forEach(([name,val], i) => {
    const h = (val / max) * 140;
    const x = 40 + i * barW;
    ctx.fillStyle = "#6f42c1";
    ctx.fillRect(x, 180 - h, barW - 12, h);
    ctx.fillStyle = "#222";
    ctx.fillText(name.slice(0, 10), x, 198);
    ctx.fillText(`R$${val.toFixed(0)}`, x, 172 - h);
  });
}

function renderPublicStore(username) {
  const user = storage.users()[username];
  if (!user) return document.body.innerHTML = "<h1>Loja não encontrada.</h1>";
  state.viewingStore = username;
  $("#authSection").classList.add("hidden");
  $("#dashboardSection").classList.add("hidden");
  $("#storeSection").classList.remove("hidden");
  $("#storeTitle").textContent = user.storeName;
  $("#storeContact").textContent = `Contato do vendedor: ${user.phone}`;
  $("#storeProducts").innerHTML = user.products.map(p => `<article class="product-card">
    <img src="${p.image}" alt="${p.name}" />
    <h3>${p.name}</h3>
    <p>${p.description}</p>
    <small>${p.category} / ${p.subCategory}</small>
    <p><b>R$ ${p.price.toFixed(2)}</b></p>
    <button onclick="openOrderDialog('${p.id}')">Comprar</button>
  </article>`).join("") || "Sem produtos disponíveis.";
}

window.openOrderDialog = (productId) => {
  $("#orderForm [name='productId']").value = productId;
  $("#orderDialog").showModal();
};

$("#orderForm").onsubmit = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const users = storage.users();
  const seller = users[state.viewingStore];
  const product = seller.products.find(p => p.id === fd.get("productId"));
  const orderId = String(Date.now()).slice(-8);
  seller.orders.unshift({
    id: orderId, productId: product.id, productName: product.name, price: product.price,
    email: fd.get("email"), contact: fd.get("contact"), theme: fd.get("theme"), gender: fd.get("gender"), age: fd.get("age"),
    notes: fd.get("notes"), receiptValid: false, createdAt: new Date().toISOString()
  });
  users[state.viewingStore] = seller;
  storage.saveUsers(users);
  $("#orderDialog").close();
  showPayment(seller, orderId);
};

function showPayment(seller, orderId) {
  $("#paymentOrderId").textContent = orderId;
  const payload = `000201PIX-${seller.pixKey}-PEDIDO-${orderId}`;
  $("#pixCopy").value = payload;
  $("#pixQr").src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`;
  $("#receiptStatus").textContent = `Após enviar o pedido, contate o vendedor: ${seller.phone}`;
  $("#paymentDialog").showModal();
}

function bindPayment() {
  $("#copyPixBtn").onclick = async () => {
    await navigator.clipboard.writeText($("#pixCopy").value);
    alert("PIX copiado!");
  };
  $("#validateReceiptBtn").onclick = () => {
    const file = $("#receiptInput").files[0];
    if (!file) return alert("Anexe um comprovante.");
    const legit = /png|jpg|jpeg|webp/i.test(file.type) && file.size > 20_000;
    $("#receiptStatus").textContent = legit
      ? "Comprovante com formato válido (pré-validação automática)."
      : "Arquivo inválido. Envie uma imagem nítida do comprovante.";
    if (legit) markOrderPaid($("#paymentOrderId").textContent);
  };
  $("#closePaymentBtn").onclick = () => $("#paymentDialog").close();
}

function markOrderPaid(orderId) {
  const users = storage.users();
  const seller = users[state.viewingStore];
  const order = seller.orders.find(o => o.id === orderId);
  if (!order) return;
  order.receiptValid = true;
  users[state.viewingStore] = seller;
  storage.saveUsers(users);
}

init();
