@echo off
cd /d "C:\Users\musta\Desktop\pro\stark\stark"
git add artifacts/caprina/src/pages/contract.tsx artifacts/caprina/src/App.tsx artifacts/caprina/src/pages/home.tsx
git commit -m "feat: add contract page with accordion UI, update home button to navigate to /contract"
git push
echo Done!
pause
