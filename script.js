// =====================
// FIREBASE — IMPÉRIO PIZZA
// =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpXGhF1jQc5kK5thqOFo1PiOsNFIQe020",
  authDomain: "imperio-pizza-80342.firebaseapp.com",
  projectId: "imperio-pizza-80342",
  storageBucket: "imperio-pizza-80342.firebasestorage.app",
  messagingSenderId: "1064542560393",
  appId: "1:1064542560393:web:0550fa8446780132bce658"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// =====================
// CONFIG GLOBAL (preenchida via Firebase)
// =====================
let _cfg = { taxaEntrega: 5, whatsapp: '5521965662993', pix: '21965662993', bairros: [] };
let _cfgCarregada = false;

function aplicarConfigNoSite(d) {
  if (d.taxaEntrega !== undefined) _cfg.taxaEntrega = parseFloat(d.taxaEntrega);
  if (d.whatsapp)    _cfg.whatsapp = '55' + d.whatsapp.replace(/\D/g, '');
  if (d.pix)         _cfg.pix = d.pix;
  if (d.bairros && Array.isArray(d.bairros)) _cfg.bairros = d.bairros;

  // Nome da loja
  if (d.nome) {
    document.querySelectorAll('.logo-name').forEach(el => el.textContent = d.nome);
    document.querySelectorAll('[data-cfg="nome-loja"]').forEach(el => el.textContent = d.nome);
    document.title = d.nome + ' — Hamburgueria & Pizzaria';
  }
  // Endereço
  if (d.endereco) {
    document.querySelectorAll('[data-cfg="endereco"]').forEach(el => el.textContent = d.endereco);
  }
  // Horário
  if (d.horario) {
    document.querySelectorAll('[data-cfg="horario"]').forEach(el => el.textContent = d.horario);
  }
  // WhatsApp links e texto
  if (d.whatsapp) {
    const num = d.whatsapp.replace(/\D/g, '');
    document.querySelectorAll('[data-cfg="whatsapp-link"]').forEach(el => {
      el.href = 'https://wa.me/55' + num;
    });
    document.querySelectorAll('[data-cfg="whatsapp-text"]').forEach(el => {
      el.textContent = d.whatsapp;
    });
  }
  // Chave Pix (atualiza o campo visível no modal de checkout)
  if (d.pix) {
    const pixEl = document.getElementById('pixKey');
    if (pixEl) pixEl.textContent = d.pix;
    _cfg.pix = d.pix;
  }
  // Montar select de bairros
  renderBairrosSelect();
  // Atualizar carrinho com taxa correta do bairro selecionado (se já tiver um)
  updateCartUI();
}

// Retorna taxa do bairro selecionado, ou null se nenhum bairro selecionado ainda
function getTaxaAtual() {
  const bairroEl = document.getElementById('bairro');
  if (!bairroEl) return _cfg.taxaEntrega || 0;
  // Se tiver bairros configurados como select
  if (_cfg.bairros && _cfg.bairros.length > 0 && bairroEl.tagName === 'SELECT') {
    const idx = bairroEl.selectedIndex;
    if (idx > 0 && _cfg.bairros[idx - 1]) {
      return parseFloat(_cfg.bairros[idx - 1].taxa) || 0;
    }
    return null; // nenhum bairro selecionado ainda
  }
  // Sem bairros configurados: campo de texto, usa taxa padrão
  return _cfg.taxaEntrega || 0;
}

function renderBairrosSelect() {
  const bairroEl = document.getElementById('bairro');
  if (!bairroEl) return;
  if (!_cfg.bairros || _cfg.bairros.length === 0) {
    // Sem bairros configurados: deixa como input texto
    if (bairroEl.tagName === 'SELECT') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'bairro';
      input.className = bairroEl.className;
      input.placeholder = 'Bairro';
      bairroEl.replaceWith(input);
    }
    return;
  }
  // Tem bairros: converte para select
  let selectEl;
  if (bairroEl.tagName !== 'SELECT') {
    selectEl = document.createElement('select');
    selectEl.id = 'bairro';
    selectEl.className = bairroEl.className || 'form-input';
    bairroEl.replaceWith(selectEl);
  } else {
    selectEl = bairroEl;
  }
  selectEl.innerHTML = '<option value="">Selecione seu bairro</option>' +
    _cfg.bairros.map(b => `<option value="${b.nome}" data-taxa="${b.taxa}">${b.nome} — R$ ${parseFloat(b.taxa).toFixed(2).replace('.',',')}</option>`).join('');
  selectEl.onchange = () => {
    updateCartUI();
    buildOrderSummary();
  };
}

// =====================
// CARDÁPIO E ESTADO
// =====================
const menu = { salgadas: [], doces: [], hamburgueres: [], combos: [] };
let lojaAberta = true;

// =====================
// PERSISTÊNCIA DO CARRINHO
// =====================
function salvarCarrinho() {
  try { localStorage.setItem('imperio_cart', JSON.stringify(cart)); } catch(e) {}
}
function carregarCarrinho() {
  try {
    const saved = localStorage.getItem('imperio_cart');
    return saved ? JSON.parse(saved) : [];
  } catch(e) { return []; }
}
let cart = carregarCarrinho();

// Mostra contagem imediatamente (antes do Firebase carregar)
(function initCartCount() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const el = document.getElementById('cartCount');
  if (el) el.textContent = count;
})();

const CARDAPIO_PADRAO = {"salgadas":[{"id":1001,"name":"Alho","ingredients":"Alho, mozzarella, orégano e azeite","sizes":{"p":34.99,"g":54.99,"gg":74.99},"img":"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80","tag":null},{"id":1002,"name":"Calabresa","ingredients":"Calabresa fatiada, mozzarella, cebola e orégano","sizes":{"p":37.99,"g":57.99,"gg":77.99},"img":"https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&q=80","tag":null},{"id":1003,"name":"Mussarela","ingredients":"Mozzarella, molho de tomate e orégano","sizes":{"p":34.99,"g":54.99,"gg":74.99},"img":"https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80","tag":"Favorita"},{"id":1004,"name":"Calabresa Imperial","ingredients":"Calabresa especial, mozzarella, catupiry e orégano","sizes":{"p":41.99,"g":61.99,"gg":81.99},"img":"https://images.unsplash.com/photo-1593560708920-61dd98db46a4?w=600&q=80","tag":"Imperial"},{"id":1005,"name":"Bacon com Ovos","ingredients":"Bacon crocante, ovos, mozzarella e orégano","sizes":{"p":38.99,"g":58.99,"gg":78.99},"img":"https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80","tag":null},{"id":1006,"name":"Bacon com Cheddar","ingredients":"Bacon crocante, cheddar cremoso, mozzarella e orégano","sizes":{"p":41.99,"g":61.99,"gg":81.99},"img":"https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=600&q=80","tag":null},{"id":1007,"name":"Frango com Catupiry","ingredients":"Frango desfiado, catupiry original, mozzarella e orégano","sizes":{"p":38.99,"g":59.99,"gg":79.99},"img":"https://images.unsplash.com/photo-1604438354936-07c5d9983bd3?w=600&q=80","tag":"Mais Pedida"},{"id":1008,"name":"Marguerita","ingredients":"Molho de tomate, mozzarella, tomate fresco e manjericão","sizes":{"p":37.99,"g":57.99,"gg":77.99},"img":"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80","tag":null},{"id":1009,"name":"Quatro Queijos","ingredients":"Mozzarella, cheddar, catupiry e parmesão","sizes":{"p":43.99,"g":63.99,"gg":81.99},"img":"https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80","tag":"Premium"},{"id":1010,"name":"Portuguesa","ingredients":"Presunto, ovos, cebola, azeitona, mozzarella e orégano","sizes":{"p":43.99,"g":61.99,"gg":81.99},"img":"https://images.unsplash.com/photo-1595984341625-f33ee10dbf9f?w=600&q=80","tag":null},{"id":1011,"name":"Atum","ingredients":"Atum, cebola, azeitona, mozzarella e orégano","sizes":{"p":40.99,"g":60.99,"gg":80.99},"img":"https://images.unsplash.com/photo-1548369937-47519962c11a?w=600&q=80","tag":null},{"id":1012,"name":"Império Pizza","ingredients":"Calabresa, bacon, frango, mozzarella e catupiry","sizes":{"p":46.99,"g":66.99,"gg":86.99},"img":"https://images.unsplash.com/photo-1542834369-f10ebf06d3e4?w=600&q=80","tag":"Especial"},{"id":1013,"name":"Cupim com Pasta de Alho","ingredients":"Cupim desfiado, pasta de alho artesanal e mozzarella","sizes":{"p":45.99,"g":65.99,"gg":85.99},"img":"https://images.unsplash.com/photo-1588315029754-2dd089a39a1a?w=600&q=80","tag":"Premium"},{"id":1014,"name":"Frango Imperial","ingredients":"Frango desfiado especial, catupiry, cheddar e orégano","sizes":{"p":44.99,"g":64.99,"gg":84.99},"img":"https://images.unsplash.com/photo-1576458088084-04a19bb13da6?w=600&q=80","tag":"Imperial"}],"doces":[{"id":2001,"name":"Chocolate","ingredients":"Chocolate ao leite derretido e granulado","sizes":{"p":38.99,"g":58.99},"img":"https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80","tag":null},{"id":2002,"name":"Banana Nevada","ingredients":"Banana, leite condensado, canela e neve de açúcar","sizes":{"p":45.99,"g":65.99},"img":"https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=80","tag":"Favorita"},{"id":2003,"name":"Romeu e Julieta","ingredients":"Goiabada cremosa e mozzarella fresca","sizes":{"p":38.99,"g":58.99},"img":"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80","tag":null},{"id":2004,"name":"Prestígio","ingredients":"Chocolate ao leite e coco ralado","sizes":{"p":38.99,"g":59.99},"img":"https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&q=80","tag":null},{"id":2005,"name":"Chocolate Mesclado","ingredients":"Chocolate ao leite e chocolate branco mesclados","sizes":{"p":41.99,"g":61.99},"img":"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80","tag":null},{"id":2006,"name":"Chocolate com Morango","ingredients":"Chocolate ao leite, morangos frescos e chantilly","sizes":{"p":41.99,"g":61.99},"img":"https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=80","tag":"Premium"},{"id":2007,"name":"Cheesecake com Geleia","ingredients":"Cream cheese, geleia de morango e calda especial","sizes":{"p":45.99,"g":65.99},"img":"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80","tag":"Especial"}],"hamburgueres":[{"id":3001,"name":"X-Império Babilônico","ingredients":"Pão, carne, queijo, molho e salada","price":11.0,"img":"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80","tag":null},{"id":3002,"name":"X-Império Persa","ingredients":"Pão, carne, ovo, queijo cheddar fatiado, molho e salada","price":14.0,"img":"https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80","tag":null},{"id":3003,"name":"X-Império Egípcio","ingredients":"Pão, carne, queijo cheddar fatiado, bacon, molho e salada","price":16.0,"img":"https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&q=80","tag":"Mais Pedido"},{"id":3004,"name":"X-Império Romano","ingredients":"Pão, carne, calabresa, queijo cheddar fatiado, molho e salada","price":15.0,"img":"https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80","tag":null},{"id":3005,"name":"X-Império Sumério","ingredients":"Pão, 2 carnes, calabresa, queijo cheddar, polenguinho, molho e salada","price":21.0,"img":"https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80","tag":"Especial"},{"id":3006,"name":"X-Império Assírio","ingredients":"Pão, 2 carnes, queijo cheddar fatiado, ovo, molho e salada","price":23.0,"img":"https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&q=80","tag":null},{"id":3007,"name":"X-Império Cruz e Souza","ingredients":"Pão, 2 carnes, 2 ovos, queijo cheddar fatiado, presunto, molho e salada","price":25.0,"img":"https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80","tag":"Premium"},{"id":3008,"name":"X-Império Lanches","ingredients":"Pão, 3 carnes, 2 ovos, bacon, calabresa, queijo cheddar, presunto, molho e salada","price":28.0,"img":"https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80","tag":"Imperial"}],"combos":[{"id":4001,"name":"Combo Império","ingredients":"2 pizzas grandes + refrigerante 2L grátis","price":109.99,"img":"https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80","tag":"Melhor Valor"},{"id":4002,"name":"Combo Dinastia","ingredients":"2 pizzas gigantes + refrigerante 2L grátis","price":134.99,"img":"https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80","tag":null}]};

async function loadMenuFromSheet() {
  try {
    // Verifica status da loja
    const configDoc = await getDoc(doc(db, 'config', 'loja'));
    if (configDoc.exists()) {
      const d = configDoc.data();
      if (d.status === 'fechada') lojaAberta = false;
      aplicarConfigNoSite(d);
    }
    _cfgCarregada = true;

    // Carrega cardápio
    const cardapioDoc = await getDoc(doc(db, 'cardapio', 'itens'));
    let dados = null;
    if (cardapioDoc.exists()) {
      dados = cardapioDoc.data();
    }
    const temItens = dados && (
      (dados.salgadas && dados.salgadas.length > 0) ||
      (dados.doces && dados.doces.length > 0) ||
      (dados.hamburgueres && dados.hamburgueres.length > 0) ||
      (dados.combos && dados.combos.length > 0)
    );
    if (temItens) {
      ['salgadas','doces','hamburgueres','combos'].forEach(cat => {
        menu[cat] = (dados[cat] || []).map((item, i) => ({ ...item, id: item.id || i+1 }));
      });
    } else {
      // Primeiro acesso: salva cardápio padrão no Firestore
      ['salgadas','doces','hamburgueres','combos'].forEach(cat => {
        menu[cat] = CARDAPIO_PADRAO[cat];
      });
      await setDoc(doc(db, 'cardapio', 'itens'), CARDAPIO_PADRAO);
      await setDoc(doc(db, 'config', 'loja'), { status: 'aberta' });
    }
  } catch(e) {
    console.error('Erro Firebase:', e);
    _cfgCarregada = true;
    ['salgadas','doces','hamburgueres','combos'].forEach(cat => {
      menu[cat] = CARDAPIO_PADRAO[cat];
    });
  }
  renderMenu('salgadas');
  updateCartUI();
}

function formatBRL(val) { return val.toFixed(2).replace('.', ','); }
function getCartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

// =====================
// RENDER CARDÁPIO
// =====================
function renderMenu(cat) {
  const grid = document.getElementById('pizzasGrid');
  if (!lojaAberta) {
    grid.innerHTML = `
      <div class="closed-box">
        <div class="closed-box-icon">🔒</div>
        <h2>Estamos Fechados</h2>
        <p>No momento não estamos aceitando pedidos online. Volte mais tarde ou entre em contato pelo WhatsApp.</p>
        <div class="closed-box-badge">
          <div class="closed-box-badge-dot"></div>
          Loja fechada no momento
        </div>
      </div>
    `;
    return;
  }
  grid.innerHTML = '';
  const items = menu[cat];
  items.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'pizza-card';
    card.style.animationDelay = `${i * 0.06}s`;
    let priceHTML = '';
    let btnData = '';
    if (p.sizes) {
      const defaultPrice = p.sizes.p;
      priceHTML = `<div class="pizza-price"><small>a partir de</small>R$ ${formatBRL(p.sizes.p)}</div>`;
      btnData = `data-id="${p.id}" data-name="${p.name}" data-price="${defaultPrice}" data-img="${p.img}" data-has-sizes="true" data-size-p="${p.sizes.p}" data-size-g="${p.sizes.g}" ${p.sizes.gg ? `data-size-gg="${p.sizes.gg}"` : ''}`;
    } else {
      priceHTML = `<div class="pizza-price"><small>&nbsp;</small>R$ ${formatBRL(p.price)}</div>`;
      btnData = `data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.img}"`;
    }
    card.innerHTML = `
      <div class="pizza-img">
        <img src="${p.img}" alt="${p.name}">
        ${p.tag ? `<span class="pizza-badge-tag">${p.tag}</span>` : ''}
      </div>
      <div class="pizza-body">
        <div class="pizza-name">${p.name}</div>
        <div class="pizza-ing">${p.ingredients}</div>
        <div class="pizza-footer">
          ${priceHTML}
          <button class="add-btn" ${btnData}>+</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// =====================
// TABS
// =====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderMenu(tab.dataset.cat);
  });
});

// =====================
// MODAL DE TAMANHO + BORDA
// =====================
let pendingItem = null;
function showSizeModal(btn) {
  pendingItem = btn.dataset;
  document.getElementById('sizeModalName').textContent = btn.dataset.name;
  const opts = document.getElementById('sizeOptions');
  opts.innerHTML = '';
  const sizes = [
    { key:'p', label:'Pequena 25cm', price: btn.dataset.sizeP },
    { key:'g', label:'Grande 35cm',  price: btn.dataset.sizeG },
  ];
  if (btn.dataset.sizeGg) sizes.push({ key:'gg', label:'Gigante 45cm', price: btn.dataset.sizeGg });
  
  // Renderiza opções de tamanho
  sizes.forEach(s => {
    const div = document.createElement('div');
    div.className = 'size-option';
    div.innerHTML = `<div class="size-info"><strong>${s.label}</strong></div><div class="size-price">R$ ${formatBRL(Number(s.price))}</div>`;
    div.addEventListener('click', () => {
      pendingItem._selectedSize = s.label;
      pendingItem._selectedPrice = Number(s.price);
      // Mostrar seleção de borda
      showBordaStep(btn);
    });
    opts.appendChild(div);
  });
  document.getElementById('sizeModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function showBordaStep(btn) {
  const opts = document.getElementById('sizeOptions');
  const sizeModal = document.querySelector('.size-modal');
  // Troca o conteúdo para escolha de borda
  const prevTitle = document.getElementById('sizeModalName').textContent;
  document.getElementById('sizeModalName').textContent = 'Escolha a borda';
  const subEl = sizeModal.querySelector('p');
  if (subEl) subEl.textContent = pendingItem._selectedSize + ' — R$ ' + formatBRL(pendingItem._selectedPrice);
  opts.innerHTML = '';

  const bordas = [
    { key: 'normal', label: 'Borda Normal', extra: 0, desc: 'Borda tradicional sem recheio' },
    { key: 'catupiry', label: 'Borda Catupiry', extra: 6.00, desc: 'Borda recheada com catupiry original' },
    { key: 'cheddar', label: 'Borda Cheddar', extra: 6.00, desc: 'Borda recheada com cheddar cremoso' },
    { key: 'chocolate', label: 'Borda Chocolate', extra: 6.00, desc: 'Borda recheada com chocolate (pizzas doces)' },
  ];

  bordas.forEach(b => {
    const div = document.createElement('div');
    div.className = 'size-option borda-option';
    const precoExtra = b.extra > 0 ? `+R$ ${formatBRL(b.extra)}` : 'Grátis';
    div.innerHTML = `
      <div class="size-info">
        <strong>${b.label}</strong>
        <small style="color:var(--texto);font-size:12px;">${b.desc}</small>
      </div>
      <div class="size-price" style="color:${b.extra>0?'var(--ouro2)':'var(--verde)'}">${precoExtra}</div>
    `;
    div.addEventListener('click', () => {
      const finalName = pendingItem.name;
      const finalPrice = pendingItem._selectedPrice + b.extra;
      const sizeLabel = pendingItem._selectedSize;
      const bordaLabel = b.key !== 'normal' ? ` + Borda ${b.label.replace('Borda ','')}` : '';
      addToCartFinal(pendingItem.id, finalName, finalPrice, pendingItem.img, sizeLabel + bordaLabel);
      // Resetar modal
      if (subEl) subEl.textContent = 'Selecione o tamanho da pizza';
      document.getElementById('sizeModalName').textContent = prevTitle;
      closeSizeModal();
    });
    opts.appendChild(div);
  });

  // Botão voltar
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Voltar ao tamanho';
  backBtn.className = 'size-back-btn';
  backBtn.addEventListener('click', () => {
    if (subEl) subEl.textContent = 'Selecione o tamanho da pizza';
    document.getElementById('sizeModalName').textContent = prevTitle;
    showSizeModal({ dataset: btn.dataset });
  });
  opts.appendChild(backBtn);
}
function closeSizeModal() {
  document.getElementById('sizeModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('sizeModalClose').addEventListener('click', closeSizeModal);
document.getElementById('sizeModalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('sizeModalOverlay')) closeSizeModal();
});

// =====================
// ADICIONAR AO CARRINHO
// =====================
document.getElementById('pizzasGrid').addEventListener('click', e => {
  const btn = e.target.closest('.add-btn');
  if (!btn) return;
  if (btn.dataset.hasSizes === 'true') {
    showSizeModal(btn);
  } else {
    addToCartFinal(btn.dataset.id, btn.dataset.name, Number(btn.dataset.price), btn.dataset.img);
  }
  btn.style.transform = 'scale(0.8) rotate(90deg)';
  setTimeout(() => btn.style.transform = '', 300);
});

function addToCartFinal(id, name, price, img, size) {
  const cartId = size ? `${id}-${size}` : id;
  const displayName = size ? `${name} (${size})` : name;
  const existing = cart.find(i => i.cartId === cartId);
  if (existing) { existing.qty++; } 
  else { cart.push({ cartId, id, name: displayName, price, img, qty: 1 }); }
  updateCartUI();
  showToast(`${name} adicionada!`);
}

// =====================
// ATUALIZAR UI CARRINHO
// =====================
function updateCartUI() {
  salvarCarrinho();
  const count = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cartCount').textContent = count;
  const itemsEl = document.getElementById('cartItems');
  const footer  = document.getElementById('cartFooter');
  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <img src="https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=200&q=60" alt="Carrinho vazio" style="width:80px;height:80px;object-fit:cover;border-radius:12px;opacity:0.3;margin-bottom:12px;">
        <p>Seu carrinho está vazio</p>
        <small>Adicione itens para começar</small>
      </div>
    `;
    footer.style.display = 'none';
    return;
  }
  footer.style.display = 'block';
  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-img"><img src="${item.img}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=200&q=60'"></div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">R$ ${formatBRL(item.price * item.qty)}</div>
      </div>
      <div class="cart-item-controls">
        <button class="ctrl-btn" data-action="dec" data-cartid="${item.cartId}">−</button>
        <span class="ctrl-qty">${item.qty}</span>
        <button class="ctrl-btn" data-action="inc" data-cartid="${item.cartId}">+</button>
      </div>
    </div>
  `).join('');
  const subtotal = getCartTotal();
  const taxa = getTaxaAtual();
  const taxaValida = taxa !== null;
  const total = subtotal + (taxaValida ? taxa : 0);
  document.getElementById('cartSubtotal').textContent = `R$ ${formatBRL(subtotal)}`;
  document.getElementById('cartTotal').textContent = taxaValida ? `R$ ${formatBRL(total)}` : `R$ ${formatBRL(subtotal)} + entrega`;
  // Atualiza exibição da taxa no carrinho
  document.querySelectorAll('[data-cfg="taxa-entrega"]').forEach(el => {
    el.textContent = taxaValida ? 'R$ ' + taxa.toFixed(2).replace('.', ',') : 'Selecione o bairro';
  });
}

document.getElementById('cartItems').addEventListener('click', e => {
  const btn = e.target.closest('.ctrl-btn');
  if (!btn) return;
  const { action, cartid } = btn.dataset;
  const item = cart.find(i => i.cartId === cartid);
  if (!item) return;
  if (action === 'inc') item.qty++;
  if (action === 'dec') { item.qty--; if (item.qty <= 0) cart = cart.filter(i => i.cartId !== cartid); }
  updateCartUI();
});

// =====================
// SIDEBAR CARRINHO
// =====================
const cartSidebar = document.getElementById('cartSidebar');
const cartOverlay = document.getElementById('cartOverlay');
function openCart() { cartSidebar.classList.add('open'); cartOverlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { cartSidebar.classList.remove('open'); cartOverlay.classList.remove('open'); document.body.style.overflow = ''; }
document.getElementById('cartTrigger').addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

// =====================
// MODAL CHECKOUT
// =====================
const modalOverlay = document.getElementById('modalOverlay');
document.getElementById('btnCheckout').addEventListener('click', () => {
  closeCart();
  setTimeout(() => {
    // Reseta campos de pagamento ao abrir o modal
    const pagEl = document.getElementById('pagamento');
    if (pagEl) pagEl.value = '';
    document.getElementById('pixBox').style.display = 'none';
    document.getElementById('trocoGroup').style.display = 'none';
    // Garante que campos de entrega aparecem/ocultam corretamente
    atualizarCamposEntrega();
    buildOrderSummary();
    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Scroll para o topo do modal
    const modalEl = modalOverlay.querySelector('.modal');
    if (modalEl) modalEl.scrollTop = 0;
  }, 300);
});
document.getElementById('modalClose').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
function closeModal() { modalOverlay.classList.remove('open'); document.body.style.overflow = ''; }

function buildOrderSummary() {
  const el = document.getElementById('orderSummary');
  if (!el) return;
  const subtotal = getCartTotal();
  const tipoPedido = document.querySelector('input[name="tipoPedido"]:checked')?.value || 'entrega';
  const taxa = tipoPedido === 'entrega' ? getTaxaAtual() : 0;
  const taxaValida = tipoPedido !== 'entrega' ? true : taxa !== null;
  const total = subtotal + (taxaValida ? taxa : 0);
  el.innerHTML = `
    <div class="order-summary-title">Resumo do Pedido</div>
    ${cart.map(i => `<div class="order-item"><span>${i.qty}x ${i.name}</span><span>R$ ${formatBRL(i.price * i.qty)}</span></div>`).join('')}
    ${tipoPedido === 'entrega' ? `<div class="order-item"><span>Entrega</span><span>${taxaValida ? 'R$ ' + formatBRL(taxa) : 'Selecione o bairro'}</span></div>` : `<div class="order-item"><span>Taxa de entrega</span><span style="color:var(--verde)">Sem taxa</span></div>`}
    <div class="order-total-line"><span>Total</span><strong>${taxaValida ? 'R$ ' + formatBRL(total) : 'R$ ' + formatBRL(subtotal) + ' + entrega'}</strong></div>
  `;
}

// Garante que pixBox começa escondido
document.getElementById('pixBox').style.display = 'none';

document.getElementById('pagamento').addEventListener('change', e => {
  document.getElementById('trocoGroup').style.display = e.target.value === 'dinheiro' ? 'block' : 'none';
  document.getElementById('pixBox').style.display = e.target.value === 'pix' ? 'block' : 'none';
});

// =====================
// TIPO DE PEDIDO — show/hide campos de entrega
// =====================
function atualizarCamposEntrega() {
  const tipo = document.querySelector('input[name="tipoPedido"]:checked')?.value || 'entrega';
  const camposEntrega = document.getElementById('camposEntrega');
  if (camposEntrega) {
    camposEntrega.style.display = tipo === 'entrega' ? 'block' : 'none';
  }
  // Atualizar taxa no carrinho
  updateCartUI();
  buildOrderSummary();
}

document.querySelectorAll('input[name="tipoPedido"]').forEach(r => {
  r.addEventListener('change', atualizarCamposEntrega);
});

// =====================
// BUSCA CEP — ViaCEP
// =====================
async function buscarCep(cep) {
  const cepLimpo = cep.replace(/\D/g, '');
  if (cepLimpo.length !== 8) return;
  const cepInput = document.getElementById('cep');
  if (cepInput) cepInput.style.borderColor = 'rgba(200,146,42,0.5)';
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const data = await res.json();
    if (data.erro) { showToast('CEP não encontrado'); return; }
    const endEl = document.getElementById('endereco');
    const bairroEl = document.getElementById('bairro');
    if (endEl && data.logradouro) {
      endEl.value = data.logradouro;
      endEl.focus();
    }
    if (bairroEl && data.bairro) {
      // Se for select de bairros, tenta selecionar o bairro mais próximo
      if (bairroEl.tagName === 'SELECT') {
        // Deixa o cliente escolher
      } else {
        bairroEl.value = data.bairro;
      }
    }
    // Focar no número após preencher
    const numEl = document.getElementById('numero');
    if (numEl) setTimeout(() => numEl.focus(), 100);
    showToast(`CEP encontrado: ${data.localidade}/${data.uf}`);
  } catch(e) {
    showToast('Erro ao buscar CEP');
  }
}

const cepEl = document.getElementById('cep');
if (cepEl) {
  cepEl.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g,'');
    if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5,8);
    e.target.value = v;
    if (v.replace(/\D/g,'').length === 8) buscarCep(v);
  });
}

// =====================
// ENVIAR PEDIDO (FIREBASE + WHATSAPP)
// =====================
document.getElementById('btnWhatsapp').addEventListener('click', async () => {
  const nome      = document.getElementById('nome').value.trim();
  const telefone  = document.getElementById('telefone').value.trim();
  const pagamento = document.getElementById('pagamento');
  const pagLabel  = pagamento.options[pagamento.selectedIndex]?.text || '';
  const troco     = document.getElementById('troco').value.trim();
  const obs       = document.getElementById('obs').value.trim();
  const tipoPedido = document.querySelector('input[name="tipoPedido"]:checked')?.value || 'entrega';

  // Campos de entrega (só obrigatórios se for entrega)
  let endereco = '', bairro = '', complemento = '', numero = '', cep = '';
  if (tipoPedido === 'entrega') {
    cep        = (document.getElementById('cep')?.value || '').trim();
    endereco   = document.getElementById('endereco').value.trim();
    numero     = (document.getElementById('numero')?.value || '').trim();
    bairro     = document.getElementById('bairro') ? (document.getElementById('bairro').tagName === 'SELECT' ? document.getElementById('bairro').value : document.getElementById('bairro').value.trim()) : '';
    complemento = document.getElementById('complemento').value.trim();
    if (!endereco || !bairro || !numero) {
      showToast('Preencha endereço, número e bairro');
      return;
    }
  }

  if (!nome || !telefone || !pagamento.value) {
    showToast('Preencha todos os campos obrigatórios');
    return;
  }

  if (!_cfgCarregada) {
    showToast('Aguarde, carregando configurações...');
    return;
  }

  const subtotal = getCartTotal();
  const taxa = tipoPedido === 'entrega' ? (getTaxaAtual() || 0) : 0;
  const total = subtotal + taxa;
  const pedidoId = 'PED-' + Date.now().toString().slice(-6);

  const TIPO_LABELS = { entrega: '🛵 Delivery', balcao: '🏠 Retirar no Balcão', local: '🪑 Consumir no Local' };
  const tipoLabel = TIPO_LABELS[tipoPedido] || tipoPedido;

  const enderecoCompleto = tipoPedido === 'entrega'
    ? `${endereco}, ${numero}${complemento ? ', ' + complemento : ''} — ${bairro}${cep ? ' — CEP ' + cep : ''}`
    : tipoLabel;

  const pedidoObj = {
    id: pedidoId,
    status: 'aguardando',
    tipoPedido,
    nome, telefone,
    endereco: tipoPedido === 'entrega' ? endereco : '',
    numero: tipoPedido === 'entrega' ? numero : '',
    complemento: tipoPedido === 'entrega' ? complemento : '',
    bairro: tipoPedido === 'entrega' ? bairro : tipoLabel,
    cep: tipoPedido === 'entrega' ? cep : '',
    pagamento: pagLabel,
    troco, obs,
    total: formatBRL(total),
    taxaEntrega: taxa,
    itens: cart.map(i => ({ qty: i.qty, nome: i.name, total: formatBRL(i.price * i.qty) })),
    criadoEm: Date.now(),
    atualizadoEm: Date.now()
  };

  try {
    await setDoc(doc(db, 'pedidos', pedidoId), pedidoObj);
  } catch(e) {
    console.error('Erro ao salvar pedido:', e);
  }

  const itens = cart.map(i => `  • ${i.qty}x ${i.name} ............ R$ ${formatBRL(i.price * i.qty)}`).join('\n');
  const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const data = new Date().toLocaleDateString('pt-BR');

  const entregaLinha = tipoPedido === 'entrega'
    ? `  Entrega:  R$ ${formatBRL(taxa)}\n`
    : `  ${tipoLabel}\n`;

  const enderecoLinha = tipoPedido === 'entrega'
    ? `\n  📍 Endereço: ${enderecoCompleto}`
    : `\n  📍 Tipo: ${tipoLabel}`;

  const msg = `🍕 *NOVO PEDIDO — IMPÉRIO PIZZA*\n━━━━━━━━━━━━━━━━━━━━━\n🔖 *Pedido:* #${pedidoId}\n🕐 *Horário:* ${horario} — ${data}\n📦 *Tipo:* ${tipoLabel}\n━━━━━━━━━━━━━━━━━━━━━\n\n📋 *ITENS DO PEDIDO*\n${itens}\n\n─────────────────────\n  Subtotal: R$ ${formatBRL(subtotal)}\n${entregaLinha}  ┌─────────────────\n  │ *TOTAL: R$ ${formatBRL(total)}*\n  └─────────────────\n━━━━━━━━━━━━━━━━━━━━━\n\n👤 *DADOS DO CLIENTE*\n  📛 Nome: ${nome}\n  📞 Telefone: ${telefone}${enderecoLinha}\n  💳 Pagamento: ${pagLabel}${troco ? `\n  💵 Troco para: ${troco}` : ''}${obs ? `\n  📝 Obs: ${obs}` : ''}\n━━━━━━━━━━━━━━━━━━━━━\n_Pedido recebido pelo site — Império Pizza_`;

  window.open(`https://wa.me/5521969959380?text=${encodeURIComponent(msg)}`, '_blank');

  closeModal();
  cart = [];
  salvarCarrinho();
  updateCartUI();
  setTimeout(() => { window.location.href = `acompanhar.html?id=${pedidoId}`; }, 800);
});

// =====================
// TOAST
// =====================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// =====================
// HEADER SCROLL
// =====================
window.addEventListener('scroll', () => {
  document.getElementById('header').classList.toggle('scrolled', window.scrollY > 40);
});

// =====================
// CURSOR
// =====================
const cursor    = document.getElementById('cursor');
const cursorDot = document.getElementById('cursorDot');
let cx = 0, cy = 0, tx = 0, ty = 0;
document.addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; cursorDot.style.left = tx + 'px'; cursorDot.style.top = ty + 'px'; });
function animateCursor() { cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12; cursor.style.left = cx + 'px'; cursor.style.top = cy + 'px'; requestAnimationFrame(animateCursor); }
animateCursor();

// =====================
// MOBILE NAV
// =====================
document.getElementById('menuToggle').addEventListener('click', () => { document.getElementById('mobileNav').classList.toggle('open'); });
function closeMobileNav() { document.getElementById('mobileNav').classList.remove('open'); }
document.getElementById('copyPixBtn').addEventListener('click', () => { const pixKey = document.getElementById('pixKey').textContent || _cfg.pix; navigator.clipboard.writeText(pixKey); showToast('Chave Pix copiada!'); });

// =====================
// INIT
// =====================
loadMenuFromSheet();
