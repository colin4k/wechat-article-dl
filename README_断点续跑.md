# 微信文章下载工具 - 断点续跑功能

## 功能特性

### 新增断点续跑功能
- 自动保存处理进度到 `progress/` 目录
- 支持从中断点恢复处理
- 多线程处理状态独立记录
- 失败URL自动记录到日志文件

## 使用方法

### 1. 正常启动处理
```bash
# 使用输入文件
node multi.js -inputfile test_urls.txt --threads 4

# 直接指定URL
node multi.js -url "https://mp.weixin.qq.com/s/example1,https://mp.weixin.qq.com/s/example2" --threads 2

# 指定输出格式
node multi.js -inputfile test_urls.txt -type markdown --threads 3

# 指定CSS选择器
node multi.js -inputfile test_urls.txt -selector ".widget-article" --threads 2
```

### 2. 断点续跑
```bash
# 从之前的进度恢复（忽略其他参数，使用保存的配置）
node multi.js --restore
```

## 进度文件说明

### 进度文件位置
- 文件路径：`progress/progress-YYYY-MM-DD.json`
- 按日期自动创建，每天一个进度文件

### 进度文件内容
```json
{
  "urls": ["url1", "url2", "..."],
  "outputType": "pdf",
  "dir": "output/",
  "threadCount": 4,
  "selector": ".widget-article",
  "startTime": "2024-01-01T10:00:00.000Z",
  "workerProgress": [
    {
      "workerId": 0,
      "urls": ["url1", "url2"],
      "startIndex": 0,
      "completedUrls": ["url1"],
      "failedUrls": [],
      "isCompleted": false
    }
  ]
}
```

## 日志文件

### 错误日志
- 位置：`logs/error-YYYY-MM-DD.log`
- 记录处理失败的URL
- 按日期自动创建

## 使用场景

### 1. 大批量处理
当需要处理大量URL时，可能因为网络问题或其他原因中断：
```bash
# 开始处理
node multi.js -inputfile large_urls.txt --threads 8

# 如果中断，直接恢复
node multi.js --restore
```

### 2. 网络不稳定环境
在网络不稳定的环境下，可以随时中断和恢复：
```bash
# 处理过程中按 Ctrl+C 中断
# 稍后恢复处理
node multi.js --restore
```

### 3. 分时段处理
可以分时段处理，避免长时间占用系统资源：
```bash
# 处理一段时间后手动停止
# 需要时再恢复
node multi.js --restore
```

## 注意事项

1. **进度文件按日期区分**：每天的进度文件是独立的
2. **恢复模式忽略其他参数**：使用 `--restore` 时，会使用保存的配置
3. **线程数恢复**：恢复时使用原来保存的线程数设置
4. **输出目录**：恢复时使用原来的输出目录设置
5. **已完成的任务会跳过**：恢复时只处理未完成的URL

## 命令行参数

```
Usage:
node multi.js [-help] <[-inputfile <file path>]|[-url <[url1][,url2]...[,urln]>]>
-help : Print command help information.
-inputfile <file path> : Specify a filename which contains urls need to be exported.
-url <[url1][,url2]...[,urln]>] : Specify one or more URLs which need to be exported, each URL will be separated by ','. 
-type <pdf|markdown|html> : Specify the output format type, default is pdf.
--threads <number> : Specify the number of threads to use, default is 1.
--restore : Restore from previous progress and continue processing.
-selector <css selector> : Specify the CSS selector for content extraction, default is 'html'.

Examples:
node multi.js -inputfile D:\urls.txt
node multi.js -url D:\urls.txt
node multi.js -url D:\urls.txt -type markdown
node multi.js -url D:\urls.txt --threads 4
node multi.js -selector ".widget-article"
node multi.js --restore
``` 