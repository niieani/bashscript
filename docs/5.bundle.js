(self.webpackJsonp=self.webpackJsonp||[]).push([[5],{9:function(e,t,n){"use strict";n.r(t),n.d(t,"initLeft",function(){return s});var a=n(163);const o=document.getElementById("left");let r;const s=(e,t)=>{if(r)return e&&r.getModel().setValue(e),r;r=a.editor.create(o,{value:e||"",language:"typescript",minimap:{enabled:!1},formatOnType:!0,scrollBeyondLastLine:!1,readOnly:!1,theme:"vs-dark"}),window.addEventListener("resize",()=>{r.layout()});const n=r.getModel();return n.onDidChangeContent(()=>{t(n.getValue())}),r}}}]);
//# sourceMappingURL=5.bundle.js.map