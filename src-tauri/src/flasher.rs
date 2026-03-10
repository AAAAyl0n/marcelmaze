use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub port_type: String,
    pub description: Option<String>,
    pub manufacturer: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareInfo {
    pub env: String,
    pub version: String,
    pub name: String,
    pub chip: String,
    pub flash_size: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashFile {
    pub offset: String,
    pub path: String,
    pub fs: Option<String>, // 如果是 "littlefs" 则为可选文件
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareManifest {
    pub name: String,
    pub version: String,
    pub env: String,
    pub chip: String,
    pub flash_size: String,
    pub baud: u32,
    pub flash_mode: String,
    pub flash_freq: String,
    pub erase_flash: bool,
    pub files: Vec<FlashFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashRequest {
    pub port: String,
    pub firmware_path: String,
    pub include_littlefs: bool,
    pub custom_baud: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FlashProgress {
    pub stage: String,
    pub current: u32,
    pub total: u32,
    pub percentage: f32,
    pub message: String,
}

pub fn get_available_ports() -> Result<Vec<SerialPortInfo>> {
    let ports = serialport::available_ports()?;
    let mut result = Vec::new();

    for port in ports {
        let info = SerialPortInfo {
            port_name: port.port_name.clone(),
            port_type: match &port.port_type {
                serialport::SerialPortType::UsbPort(_usb) => format!("USB"),
                serialport::SerialPortType::BluetoothPort => format!("Bluetooth"),
                serialport::SerialPortType::PciPort => format!("PCI"),
                serialport::SerialPortType::Unknown => format!("Unknown"),
            },
            description: match &port.port_type {
                serialport::SerialPortType::UsbPort(usb) => usb.product.clone(),
                _ => None,
            },
            manufacturer: match &port.port_type {
                serialport::SerialPortType::UsbPort(usb) => usb.manufacturer.clone(),
                _ => None,
            },
            vid: match &port.port_type {
                serialport::SerialPortType::UsbPort(usb) => Some(usb.vid),
                _ => None,
            },
            pid: match &port.port_type {
                serialport::SerialPortType::UsbPort(usb) => Some(usb.pid),
                _ => None,
            },
        };
        result.push(info);
    }

    Ok(result)
}

pub fn get_available_firmware(app: AppHandle) -> Result<Vec<FirmwareInfo>> {
    // 尝试多种候选目录，兼容不同工作目录
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("src-tauri").join("resources").join("firmware"));
        candidates.push(cwd.join("resources").join("firmware"));
    }
    if let Ok(res_dir) = app.path().resource_dir() {
        // 打包后资源会保留相对路径，常见为 Resources/resources/firmware
        candidates.push(res_dir.join("firmware"));
        candidates.push(res_dir.join("resources").join("firmware"));
    }
    let firmware_dir = candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| anyhow!("Firmware directory not found. 请确认 src-tauri/resources/firmware 是否存在"))?;
    
    if !firmware_dir.exists() {
        return Ok(Vec::new());
    }

    let mut firmware_list = Vec::new();
    
    // 遍历 env 目录 (eous, amillion, paperboo)
    for env_entry in fs::read_dir(&firmware_dir)? {
        let env_entry = env_entry?;
        if !env_entry.file_type()?.is_dir() {
            continue;
        }
        
        let env_name = env_entry.file_name().to_string_lossy().to_string();
        let env_path = env_entry.path();
        
        // 遍历版本目录
        for version_entry in fs::read_dir(&env_path)? {
            let version_entry = version_entry?;
            if !version_entry.file_type()?.is_dir() {
                continue;
            }
            
            let version_name = version_entry.file_name().to_string_lossy().to_string();
            let version_path = version_entry.path();
            let manifest_path = version_path.join("manifest.json");
            
            if manifest_path.exists() {
                match load_manifest(&manifest_path) {
                    Ok(manifest) => {
                        firmware_list.push(FirmwareInfo {
                            env: env_name.clone(),
                            version: version_name.clone(),
                            name: manifest.name,
                            chip: manifest.chip,
                            flash_size: manifest.flash_size,
                            path: version_path.to_string_lossy().to_string(),
                        });
                    }
                    Err(e) => {
                        eprintln!("Failed to load manifest {}: {}", manifest_path.display(), e);
                    }
                }
            }
        }
    }
    
    Ok(firmware_list)
}

fn load_manifest(path: &Path) -> Result<FirmwareManifest> {
    let content = fs::read_to_string(path)?;
    let manifest: FirmwareManifest = serde_json::from_str(&content)?;
    Ok(manifest)
}

#[allow(dead_code)]
fn calculate_sha256(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

#[allow(dead_code)]
fn verify_file_integrity(file_path: &Path, expected_sha256: Option<&str>) -> Result<()> {
    if let Some(expected) = expected_sha256 {
        let mut file = fs::File::open(file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        
        let actual = calculate_sha256(&buffer);
        if actual.to_lowercase() != expected.to_lowercase() {
            return Err(anyhow!(
                "SHA256 mismatch for {}: expected {}, got {}",
                file_path.display(),
                expected,
                actual
            ));
        }
    }
    Ok(())
}

pub async fn flash_firmware(
    app: AppHandle,
    request: FlashRequest,
) -> Result<()> {
    let firmware_path = PathBuf::from(&request.firmware_path);
    let manifest_path = firmware_path.join("manifest.json");
    
    if !manifest_path.exists() {
        return Err(anyhow!("Manifest file not found: {}", manifest_path.display()));
    }
    
    let manifest = load_manifest(&manifest_path)?;
    let baud = request.custom_baud.unwrap_or(manifest.baud);
    
    // 发送开始事件
    app.emit("flash-progress", FlashProgress {
        stage: "preparing".to_string(),
        current: 0,
        total: 100,
        percentage: 0.0,
        message: "准备烧录...".to_string(),
    })?;
    
    // 过滤要烧录的文件
    let files_to_flash: Vec<FlashFile> = manifest.files.iter()
        .filter(|file| {
            if let Some(fs_type) = &file.fs {
                if fs_type == "littlefs" {
                    return request.include_littlefs;
                }
            }
            true
        })
        .cloned()
        .collect();
    
    let total_files = files_to_flash.len() as u32;
    
    // 验证文件完整性
    app.emit("flash-progress", FlashProgress {
        stage: "verifying".to_string(),
        current: 0,
        total: 100,
        percentage: 5.0,
        message: "验证文件完整性...".to_string(),
    })?;
    
    for file in &files_to_flash {
        let file_path = firmware_path.join(&file.path);
        if !file_path.exists() {
            return Err(anyhow!("Firmware file not found: {}", file_path.display()));
        }
        // 这里可以添加 SHA256 验证，如果 manifest 中包含校验值
    }
    
    // 连接设备
    app.emit("flash-progress", FlashProgress {
        stage: "connecting".to_string(),
        current: 0,
        total: 100,
        percentage: 10.0,
        message: format!("连接到 {} ({})", request.port, baud),
    })?;
    
    // 使用 espflash 进行烧录
    let result = tokio::task::spawn_blocking({
        let app = app.clone();
        let port = request.port.clone();
        let firmware_path = firmware_path.clone();
        // manifest 如需在后续扩展中使用，可在此处克隆；当前未使用，移除以消除编译告警
        let files_to_flash = files_to_flash.clone();
        let total_files = total_files;
        
        move || -> Result<()> {
            // 通过 which 定位 espflash 可执行文件，避免 PATH 问题
            use std::process::Command;
            let espflash_path = which::which("espflash")
                .map_err(|_| anyhow!("未找到 espflash 可执行文件，请确保 cargo 安装目录在 PATH，例如 ~/.cargo/bin"))?;
            
            for (index, file) in files_to_flash.iter().enumerate() {
                let current_file = index as u32 + 1;
                let percentage = 10.0 + (80.0 * current_file as f32 / total_files as f32);
                
                app.emit("flash-progress", FlashProgress {
                    stage: "flashing".to_string(),
                    current: current_file,
                    total: total_files,
                    percentage,
                    message: format!("烧录 {} ({}/{})", file.path, current_file, total_files),
                }).map_err(|e| anyhow!("Failed to emit progress: {}", e))?;
                
                let file_path = firmware_path.join(&file.path);
                
                // 解析偏移地址
                let offset_str = if file.offset.starts_with("0x") {
                    file.offset.clone()
                } else {
                    format!("0x{}", file.offset)
                };
                
                // 使用 espflash write-bin 命令（write-bin 不接受 flash 参数）
                let mut cmd = Command::new(&espflash_path);
                cmd.args([
                    "write-bin",
                    "--port", &port,
                    "--baud", &baud.to_string(),
                    &offset_str,
                    file_path.to_str().unwrap(),
                ]);
                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::piped());
                
                let mut child = cmd.spawn()
                    .map_err(|e| anyhow!("Failed to execute espflash command: {}. 请确保已安装 espflash 工具", e))?;

                // 按行读取 stdout/stderr，解析百分比
                use std::io::{BufRead, BufReader};
                use regex::Regex;
                let percent_re = Regex::new(r"(\d+)%").ok();
                let mut last_percent: i32 = -1;

                if let Some(stdout) = &mut child.stdout {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            if let Some(re) = &percent_re {
                                if let Some(cap) = re.captures(&l) {
                                    if let Some(p) = cap.get(1) {
                                        if let Ok(pct) = p.as_str().parse::<i32>() {
                                            if pct != last_percent {
                                                last_percent = pct;
                                                let overall = 10.0 + (80.0 * (current_file as f32 - 1.0 + pct as f32 / 100.0) / total_files as f32);
                                                app.emit("flash-progress", FlashProgress {
                                                    stage: "flashing".to_string(),
                                                    current: current_file,
                                                    total: total_files,
                                                    percentage: overall.clamp(10.0, 99.0),
                                                    message: format!("{}: {}%", file.path, pct),
                                                }).ok();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if let Some(stderr) = &mut child.stderr {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            if let Some(re) = &percent_re {
                                if let Some(cap) = re.captures(&l) {
                                    if let Some(p) = cap.get(1) {
                                        if let Ok(pct) = p.as_str().parse::<i32>() {
                                            if pct != last_percent {
                                                last_percent = pct;
                                                let overall = 10.0 + (80.0 * (current_file as f32 - 1.0 + pct as f32 / 100.0) / total_files as f32);
                                                app.emit("flash-progress", FlashProgress {
                                                    stage: "flashing".to_string(),
                                                    current: current_file,
                                                    total: total_files,
                                                    percentage: overall.clamp(10.0, 99.0),
                                                    message: format!("{}: {}%", file.path, pct),
                                                }).ok();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let output = child.wait_with_output()
                    .map_err(|e| anyhow!("espflash 进程等待失败: {}", e))?;
                
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    return Err(anyhow!("espflash 执行失败:\nSTDERR: {}\nSTDOUT: {}", stderr, stdout));
                }
            }
            
            Ok(())
        }
    }).await?;
    
    match result {
        Ok(_) => {
            app.emit("flash-progress", FlashProgress {
                stage: "completed".to_string(),
                current: total_files,
                total: total_files,
                percentage: 100.0,
                message: "烧录完成！".to_string(),
            })?;
            
            app.emit("flash-complete", serde_json::json!({
                "success": true,
                "message": "固件烧录成功"
            }))?;
        }
        Err(e) => {
            app.emit("flash-complete", serde_json::json!({
                "success": false,
                "message": format!("烧录失败: {}", e)
            }))?;
            return Err(e);
        }
    }
    
    Ok(())
}
