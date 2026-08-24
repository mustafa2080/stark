// خلفية الفيديو لصفحة تسجيل الدخول — منقول من index.html عشان CSP الصارمة تمنع inline scripts
(function(){
  function isLoginPath(){
    var p = window.location.pathname;
    return p === '/login' || p === '/login/';
  }
  function checkRoute(){
    var v = document.getElementById('login-bg-video');
    var html = document.documentElement;
    if(!v) return;
    if(isLoginPath()){
      v.style.display = 'block';
      html.classList.add('login-active');
      if(v.readyState === 0){ v.load(); }
      if(v.paused){ v.play().catch(function(){}); }
    } else {
      v.style.display = 'none';
      html.classList.remove('login-active');
      v.pause();
    }
  }
  checkRoute();
  var _push = history.pushState;
  history.pushState = function(){ _push.apply(history, arguments); setTimeout(checkRoute, 50); };
  var _replace = history.replaceState;
  history.replaceState = function(){ _replace.apply(history, arguments); setTimeout(checkRoute, 50); };
  window.addEventListener('popstate', checkRoute);
  window.addEventListener('load', function(){ setTimeout(checkRoute, 300); });
})();
