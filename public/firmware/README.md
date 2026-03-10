将固件按如下结构放在该目录：

- `public/firmware/<env>/<version>/manifest.json`
- `public/firmware/<env>/<version>/bootloader.bin`
- `public/firmware/<env>/<version>/partitions.bin`
- `public/firmware/<env>/<version>/firmware.bin`
- `public/firmware/<env>/<version>/littlefs.bin`（可选）

并在 `public/firmware/index.json` 中注册对应 `env/version` 项。
