$env:DATABASE_URL = "mysql://root:123456@localhost:3306/stark_dev"
Set-Location "C:\Users\musta\Desktop\pro\stark\stark\lib\db"
& ".\node_modules\.bin\drizzle-kit.CMD" push --config ./drizzle.config.ts
