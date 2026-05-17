/* ===========================
   재고 관리 시스템 - app.js
   (로그인 + 권한 기능 포함)
   =========================== */

// ──────────────────────────────────────────
// 1. Supabase 연결 설정
// ──────────────────────────────────────────
const SUPABASE_URL = 'https://jghoyzmizwbsomkpxebm.supabase.co/rest/v1/
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnaG95em1pendic29ta3B4ZWJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5ODM1OTAsImV4cCI6MjA5NDU1OTU5MH0.JbNHPB3O0sxfKpsTF1oj7QDQ5JmTq3kU21Ycormk15w'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 현재 로그인 유저 & 역할 저장
let currentUser = null
let currentRole = null  // 'super_admin' | 'staff' | 'viewer'


// ──────────────────────────────────────────
// 2. 유틸 함수
// ──────────────────────────────────────────
const $ = id => document.getElementById(id)
const hide = el => el.classList.add('hidden')
const show = el => el.classList.remove('hidden')

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
}

function stockBadge(qty, min) {
  if (qty <= 0) return `<span class="badge badge-danger">품절</span>`
  if (qty <= min) return `<span class="badge badge-warn">부족</span>`
  return `<span class="badge badge-ok">정상</span>`
}

function channelTag(channel) {
  const map = {
    naver: `<span class="channel-tag channel-naver">네이버</span>`,
    coupang: `<span class="channel-tag channel-coupang">쿠팡</span>`,
    manual: `<span class="channel-tag channel-manual">직접입력</span>`
  }
  return map[channel] || channel
}

// 역할별 권한 체크
const can = {
  edit: () => ['super_admin', 'staff'].includes(currentRole),
  delete: () => currentRole === 'super_admin',
  manageUsers: () => currentRole === 'super_admin',
}


// ──────────────────────────────────────────
// 3. 인증 체크 (로그인 안 되어 있으면 login.html로)
// ──────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await db.auth.getSession()

  if (!session) {
    window.location.href = 'login.html'
    return false
  }

  currentUser = session.user

  const { data: roleData } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', currentUser.id)
    .single()

  currentRole = roleData?.role || 'viewer'

  renderUserInfo()
  applyRoleUI()
  return true
}


// ──────────────────────────────────────────
// 4. 헤더 유저 정보 + 로그아웃
// ──────────────────────────────────────────
function renderUserInfo() {
  const roleLabel = { super_admin: '슈퍼관리자', staff: '직원', viewer: '뷰어' }
  const userEl = document.createElement('div')
  userEl.className = 'user-info'
  userEl.innerHTML = `
    <span class="user-email">${currentUser.email}</span>
    <span class="badge ${currentRole === 'super_admin' ? 'badge-ok' : currentRole === 'staff' ? 'badge-pending' : 'badge-warn'}">
      ${roleLabel[currentRole] || currentRole}
    </span>
    <button class="btn btn-ghost btn-sm" id="btn-logout">로그아웃</button>
  `
  document.querySelector('.header-inner').appendChild(userEl)
  $('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut()
    window.location.href = 'login.html'
  })
}


// ──────────────────────────────────────────
// 5. 역할별 UI 적용
// ──────────────────────────────────────────
function applyRoleUI() {
  if (!can.edit()) {
    document.querySelectorAll('.edit-only').forEach(el => hide(el))
  }
  if (!can.manageUsers()) {
    const adminTab = document.querySelector('[data-tab="admin"]')
    if (adminTab) hide(adminTab)
  }
}


// ──────────────────────────────────────────
// 6. 탭 전환
// ──────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')
  })
})


// ──────────────────────────────────────────
// 7. 대시보드 요약
// ──────────────────────────────────────────
async function loadDashboard() {
  const { data: products } = await db.from('products').select('*')
  if (!products) return

  $('total-products').textContent = products.length
  $('low-stock-count').textContent = products.filter(p => p.actual_stock <= p.min_stock).length

  const today = new Date().toISOString().split('T')[0]
  const { data: orders } = await db.from('orders').select('id').gte('created_at', today)
  $('today-orders').textContent = orders ? orders.length : 0

  const { data: purchases } = await db.from('purchases').select('id').in('status', ['ordered', 'partial'])
  $('pending-purchases').textContent = purchases ? purchases.length : 0
}


// ──────────────────────────────────────────
// 8. 재고 현황
// ──────────────────────────────────────────
async function loadStock() {
  const { data: products, error } = await db.from('products').select('*').order('created_at', { ascending: false })
  if (error) { console.error(error); return }

  const tbody = $('stock-tbody')
  if (!products || products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px">상품이 없습니다.</td></tr>`
    return
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${p.name}</td>
      <td style="font-family:var(--mono);font-size:0.8rem">${p.sku || '-'}</td>
      <td>${p.category || '-'}</td>
      <td class="qty">₩${Number(p.price).toLocaleString()}</td>
      <td class="qty">${p.system_stock ?? 0}</td>
      <td class="qty">${p.actual_stock ?? 0}</td>
      <td class="qty">${p.min_stock ?? 0}</td>
      <td>${stockBadge(p.actual_stock, p.min_stock)}</td>
      <td>
        ${can.edit() ? `<button class="btn btn-sm btn-ghost" onclick="openAdjustModal('${p.id}', '${p.name}', ${p.actual_stock})">조정</button>` : '-'}
      </td>
    </tr>
  `).join('')
}

$('btn-add-product').addEventListener('click', () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  show($('form-add-product'))
})
$('btn-cancel-product').addEventListener('click', () => {
  hide($('form-add-product'))
  clearProductForm()
})

function clearProductForm() {
  ['input-name','input-sku','input-category','input-price','input-stock','input-min-stock','input-naver-id','input-coupang-id']
    .forEach(id => $(id).value = '')
}

$('btn-submit-product').addEventListener('click', async () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  const name = $('input-name').value.trim()
  if (!name) { alert('상품명은 필수입니다!'); return }

  const { error } = await db.from('products').insert({
    name,
    sku: $('input-sku').value.trim() || null,
    category: $('input-category').value.trim() || null,
    price: Number($('input-price').value) || 0,
    actual_stock: Number($('input-stock').value) || 0,
    system_stock: Number($('input-stock').value) || 0,
    min_stock: Number($('input-min-stock').value) || 10,
    naver_product_id: $('input-naver-id').value.trim() || null,
    coupang_product_id: $('input-coupang-id').value.trim() || null,
  })

  if (error) { alert('저장 실패: ' + error.message); return }
  hide($('form-add-product'))
  clearProductForm()
  await loadStock()
  await loadDashboard()
})

let adjustTargetId = null

function openAdjustModal(id, name, currentQty) {
  adjustTargetId = id
  $('modal-product-name').textContent = `${name} · 현재 실재고: ${currentQty}`
  $('input-adjust-qty').value = currentQty
  $('input-adjust-reason').value = ''
  show($('modal-adjust'))
}

$('btn-cancel-adjust').addEventListener('click', () => hide($('modal-adjust')))
$('modal-adjust').addEventListener('click', e => {
  if (e.target === $('modal-adjust')) hide($('modal-adjust'))
})

$('btn-submit-adjust').addEventListener('click', async () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  const newQty = Number($('input-adjust-qty').value)
  const reason = $('input-adjust-reason').value.trim()
  if (isNaN(newQty)) { alert('수량을 입력해주세요'); return }

  const { data: product } = await db.from('products').select('actual_stock').eq('id', adjustTargetId).single()

  await db.from('stock_adjustments').insert({
    product_id: adjustTargetId,
    before_qty: product.actual_stock,
    after_qty: newQty,
    reason: reason || null
  })

  const { error } = await db.from('products').update({ actual_stock: newQty }).eq('id', adjustTargetId)
  if (error) { alert('조정 실패: ' + error.message); return }

  hide($('modal-adjust'))
  await loadStock()
  await loadDashboard()
})


// ──────────────────────────────────────────
// 9. 출고 내역
// ──────────────────────────────────────────
async function loadOrders() {
  const { data: orders, error } = await db
    .from('orders')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return }

  const tbody = $('orders-tbody')
  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">출고 내역이 없습니다.</td></tr>`
    return
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td>${formatDate(o.created_at)}</td>
      <td>${o.products?.name || '-'}</td>
      <td>${channelTag(o.channel)}</td>
      <td style="font-family:var(--mono);font-size:0.8rem">${o.order_no || '-'}</td>
      <td class="qty">${o.qty}</td>
      <td><span class="badge ${o.status === 'shipped' ? 'badge-ok' : o.status === 'cancelled' ? 'badge-danger' : 'badge-pending'}">
        ${o.status === 'shipped' ? '출고완료' : o.status === 'cancelled' ? '취소' : '처리중'}
      </span></td>
    </tr>
  `).join('')
}

$('btn-add-order').addEventListener('click', async () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  await fillProductSelect('input-order-product')
  show($('form-add-order'))
})
$('btn-cancel-order').addEventListener('click', () => hide($('form-add-order')))

$('btn-submit-order').addEventListener('click', async () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  const productId = $('input-order-product').value
  const qty = Number($('input-order-qty').value)
  if (!productId) { alert('상품을 선택해주세요'); return }
  if (!qty || qty <= 0) { alert('출고 수량을 입력해주세요'); return }

  const { error } = await db.from('orders').insert({
    product_id: productId,
    channel: $('input-order-channel').value,
    order_no: $('input-order-no').value.trim() || null,
    qty,
    status: 'pending',
    ordered_at: new Date().toISOString()
  })
  if (error) { alert('저장 실패: ' + error.message); return }

  const { data: product } = await db.from('products').select('system_stock, actual_stock').eq('id', productId).single()
  await db.from('products').update({
    system_stock: (product.system_stock || 0) - qty,
    actual_stock: (product.actual_stock || 0) - qty
  }).eq('id', productId)

  $('input-order-no').value = ''
  $('input-order-qty').value = ''
  hide($('form-add-order'))
  await loadOrders()
  await loadStock()
  await loadDashboard()
})


// ──────────────────────────────────────────
// 10. 발주 내역
// ──────────────────────────────────────────
async function loadPurchases() {
  const { data: purchases, error } = await db
    .from('purchases')
    .select('*, products(name)')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return }

  const tbody = $('purchases-tbody')
  if (!purchases || purchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">발주 내역이 없습니다.</td></tr>`
    return
  }

  tbody.innerHTML = purchases.map(p => `
    <tr>
      <td>${formatDate(p.ordered_at || p.created_at)}</td>
      <td>${p.products?.name || '-'}</td>
      <td class="qty">${p.qty}</td>
      <td class="qty">${p.received_qty ?? 0}</td>
      <td>${p.note || '-'}</td>
      <td><span class="badge ${
        p.status === 'completed' ? 'badge-ok' :
        p.status === 'partial'   ? 'badge-warn' : 'badge-pending'
      }">
        ${p.status === 'completed' ? '입고완료' : p.status === 'partial' ? '부분입고' : '입고대기'}
      </span></td>
      <td>
        ${can.edit() && p.status !== 'completed' ? `
          <button class="btn btn-sm btn-ghost" onclick="receivePurchase('${p.id}', ${p.qty}, ${p.received_qty ?? 0}, '${p.product_id}')">
            입고 처리
          </button>` : '-'}
      </td>
    </tr>
  `).join('')
}

$('btn-add-purchase').addEventListener('click', async () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  await fillProductSelect('input-purchase-product')
  show($('form-add-purchase'))
})
$('btn-cancel-purchase').addEventListener('click', () => hide($('form-add-purchase')))

$('btn-submit-purchase').addEventListener('click', async () => {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  const productId = $('input-purchase-product').value
  const qty = Number($('input-purchase-qty').value)
  if (!productId) { alert('상품을 선택해주세요'); return }
  if (!qty || qty <= 0) { alert('발주 수량을 입력해주세요'); return }

  const { error } = await db.from('purchases').insert({
    product_id: productId,
    qty,
    received_qty: 0,
    status: 'ordered',
    note: $('input-purchase-note').value.trim() || null,
    ordered_at: new Date().toISOString()
  })
  if (error) { alert('저장 실패: ' + error.message); return }

  $('input-purchase-qty').value = ''
  $('input-purchase-note').value = ''
  hide($('form-add-purchase'))
  await loadPurchases()
  await loadDashboard()
})

async function receivePurchase(purchaseId, totalQty, receivedQty, productId) {
  if (!can.edit()) { alert('권한이 없습니다'); return }
  const remaining = totalQty - receivedQty
  const input = prompt(`입고 수량 입력 (최대 ${remaining}개)`, remaining)
  if (input === null) return

  const receiveQty = Number(input)
  if (isNaN(receiveQty) || receiveQty <= 0 || receiveQty > remaining) {
    alert('올바른 수량을 입력해주세요'); return
  }

  const newReceived = receivedQty + receiveQty
  const newStatus = newReceived >= totalQty ? 'completed' : 'partial'

  await db.from('purchases').update({
    received_qty: newReceived,
    status: newStatus,
    received_at: newStatus === 'completed' ? new Date().toISOString() : null
  }).eq('id', purchaseId)

  const { data: product } = await db.from('products').select('system_stock, actual_stock').eq('id', productId).single()
  await db.from('products').update({
    system_stock: (product.system_stock || 0) + receiveQty,
    actual_stock: (product.actual_stock || 0) + receiveQty
  }).eq('id', productId)

  await loadPurchases()
  await loadStock()
  await loadDashboard()
}


// ──────────────────────────────────────────
// 11. 유저 관리 (슈퍼관리자 전용)
// ──────────────────────────────────────────
async function loadUserManagement() {
  if (!can.manageUsers()) return

  const { data: users } = await db.from('user_roles').select('*').order('created_at')
  const tbody = $('users-tbody')
  if (!tbody) return

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px">등록된 유저가 없습니다.</td></tr>`
    return
  }

  const roleLabel = { super_admin: '슈퍼관리자', staff: '직원', viewer: '뷰어' }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.email}</td>
      <td>
        <select class="input" style="min-width:120px;flex:none" onchange="updateUserRole('${u.user_id}', this.value)">
          <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>슈퍼관리자</option>
          <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>직원</option>
          <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>뷰어</option>
        </select>
      </td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        ${u.user_id !== currentUser.id
          ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteUser('${u.user_id}')">삭제</button>`
          : '<span style="color:var(--text-muted);font-size:0.8rem">본인</span>'}
      </td>
    </tr>
  `).join('')
}

async function updateUserRole(userId, newRole) {
  if (!can.manageUsers()) return
  const { error } = await db.from('user_roles').update({ role: newRole }).eq('user_id', userId)
  if (error) alert('역할 변경 실패: ' + error.message)
}

async function deleteUser(userId) {
  if (!can.manageUsers()) return
  if (!confirm('이 유저를 삭제하시겠습니까?')) return
  await db.from('user_roles').delete().eq('user_id', userId)
  await loadUserManagement()
}


// ──────────────────────────────────────────
// 12. 상품 셀렉트 채우기 (공통)
// ──────────────────────────────────────────
async function fillProductSelect(selectId) {
  const { data: products } = await db.from('products').select('id, name').order('name')
  const select = $(selectId)
  select.innerHTML = `<option value="">상품 선택</option>` +
    (products || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('')
}


// ──────────────────────────────────────────
// 13. 실시간 구독
// ──────────────────────────────────────────
db.channel('realtime-inventory')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
    loadStock(); loadDashboard()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
    loadOrders(); loadDashboard()
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
    loadPurchases(); loadDashboard()
  })
  .subscribe()


// ──────────────────────────────────────────
// 14. 앱 초기화
// ──────────────────────────────────────────
async function init() {
  const ok = await checkAuth()
  if (!ok) return

  await loadDashboard()
  await loadStock()
  await loadOrders()
  await loadPurchases()
  if (can.manageUsers()) await loadUserManagement()
}

init()
