/* Shared MABROUK TRADER'S navigation.
   Adds consistent page navigation without touching business logic or stored data. */
(() => {
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (document.querySelector('.sidebar')) return;

  const links = [
    ['index.html','⌂','Home'],
    ['pos.html','▣','POS'],
    ['inventory.html','▤','Inventory'],
    ['customers.html','♧','Customers'],
    ['sales.html','▱','Sales'],
    ['transaction-verification.html','✓','Verify Payments'],
    ['debts.html','▧','Debts'],
    ['savings.html','◈','Savings'],
    ['dashboard.html','▥','Dashboard'],
    ['reports.html','▤','Reports'],
    ['users.html','♙','Users'],
    ['settings.html','⚙','Settings'],
    ['control-room.html','⌘','Master Control'],
    ['emergency-recovery.html','🛟','Emergency Recovery'],
    ['records-vault.html','🗄','10-Year Records Vault']
  ];

  const aside = document.createElement('aside');
  aside.className = 'sidebar mt-shared-sidebar';
  aside.setAttribute('aria-label','Main navigation');
  const nav = document.createElement('nav');
  nav.className = 'nav';
  links.forEach(([href,glyph,label]) => {
    const a = document.createElement('a');
    a.href = href;
    a.innerHTML = '<span class="nav-icon" aria-hidden="true"></span>';
    a.querySelector('.nav-icon').textContent = glyph;
    a.append(document.createTextNode(label));
    if (path === href) {
      a.classList.add('active');
      a.setAttribute('aria-current','page');
    }
    nav.append(a);
  });
  const logout = document.createElement('a');
  logout.href = 'login.html';
  logout.className = 'mt-shared-logout';
  logout.dataset.logout = '';
  logout.innerHTML = '<span class="nav-icon" aria-hidden="true">⇥</span>Logout';
  nav.append(logout);
  aside.append(nav);
  document.body.append(aside);

  const style = document.createElement('style');
  style.textContent = `
    .mt-shared-sidebar{position:fixed!important;left:0;top:68px;bottom:0;width:225px;padding:16px 10px;overflow-y:auto;z-index:18;background:#fff;border-right:1px solid #e6b8c0;box-shadow:5px 0 18px rgba(80,0,20,.05)}
    .mt-shared-sidebar .nav{display:flex;flex-direction:column;gap:3px}
    .mt-shared-sidebar .nav a{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:9px;color:#171014;text-decoration:none;font-size:13px;font-weight:650;white-space:nowrap}
    .mt-shared-sidebar .nav a:hover,.mt-shared-sidebar .nav a.active{background:#c90024!important;color:#fff!important}
    .mt-shared-sidebar .nav-icon{width:20px;flex:0 0 20px;text-align:center;font-size:16px}
    .mt-shared-sidebar .mt-shared-logout{margin-top:12px;color:#c90024}
    body.mt-has-shared-nav .page,body.mt-has-shared-nav .wrap,body.mt-has-shared-nav>main{margin-left:225px!important;max-width:calc(100% - 225px)!important}
    body.mt-has-shared-nav main{max-width:calc(100% - 225px)}
    @media(max-width:700px){
      .mt-shared-sidebar{top:56px;width:145px;padding:10px 6px}
      .mt-shared-sidebar .nav a{font-size:11px;padding:10px 7px;gap:6px}
      .mt-shared-sidebar .nav-icon{width:17px;flex-basis:17px;font-size:14px}
      body.mt-has-shared-nav .page,body.mt-has-shared-nav .wrap,body.mt-has-shared-nav>main{margin-left:145px!important;max-width:calc(100% - 145px)!important}
      body.mt-has-shared-nav main{max-width:calc(100% - 145px)}
    }
    @media(max-width:430px){
      .mt-shared-sidebar{position:relative!important;top:auto;bottom:auto;width:100%;max-height:none;border-right:0;border-bottom:1px solid #e6b8c0;padding:6px}
      .mt-shared-sidebar .nav{flex-direction:row;overflow-x:auto;white-space:nowrap}
      .mt-shared-sidebar .nav a{flex:0 0 auto}
      body.mt-has-shared-nav .page,body.mt-has-shared-nav .wrap,body.mt-has-shared-nav>main{margin-left:0!important;max-width:100%!important}
      body.mt-has-shared-nav main{max-width:100%}
    }`;
  document.head.append(style);
  document.body.classList.add('mt-has-shared-nav');
})();