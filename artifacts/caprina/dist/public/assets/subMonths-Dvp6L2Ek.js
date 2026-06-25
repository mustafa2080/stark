import{t as c,c as s}from"./format-CzfXRGH8.js";function i(e,n){const t=c(e);if(isNaN(n))return s(e,NaN);if(!n)return t;const r=t.getDate(),o=s(e,t.getTime());o.setMonth(t.getMonth()+n+1,0);const a=o.getDate();return r>=a?o:(t.setFullYear(o.getFullYear(),o.getMonth(),r),t)}function f(e,n){return i(e,-n)}export{f as s};
//# sourceMappingURL=subMonths-Dvp6L2Ek.js.map
