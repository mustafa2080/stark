// تهيئة الثيم (dark/light) قبل رسم الصفحة — منقول من index.html عشان CSP الصارمة
(function(){
  var t = localStorage.getItem('caprina-theme') || 'dark';
  document.documentElement.classList.add(t);
})();
