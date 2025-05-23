const puppeteer = require("puppeteer");
const { Worker } = require('worker_threads');
const fs = require('fs')
const path = require('path')
let InputFile = null
let URLS = []
let argError = false;
let dir='output/'
let outputType = 'pdf' // 默认输出类型为pdf
let threadCount = 1; // 默认线程数为1
let restoreMode = false; // 是否为恢复模式
let usage = `
Usage:
node multi.js [-help] <[-inputfile <file path>]|[-url <[url1][,url2]...[,urln]>]>
-help : Print command help information.
-inputfile <file path> : Specify a filename which contains urls need to be exported.
-url <[url1][,url2]...[,urln]>] : Specify one or more URLs which need to be exported, each URL will be separated by ','. 
-type <pdf|markdown|html> : Specify the output format type, default is pdf.
--threads <number> : Specify the number of threads to use, default is 1.
--restore : Restore from previous progress and continue processing.
Examples:
node multi.js -inputfile D:\\urls.txt
node multi.js -url D:\\urls.txt
node multi.js -url D:\\urls.txt -type markdown
node multi.js -url D:\\urls.txt --threads 4
node multi.js --restore
`

String.prototype.replaceAll = function(s1, s2) {
	return this.replace(new RegExp(s1, "gm"), s2);
}

// 获取当前日期字符串，格式：YYYY-MM-DD
const getCurrentDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// 进度文件路径
const getProgressFilePath = () => {
  const progressDir = path.join(process.cwd(), 'progress');
  if (!fs.existsSync(progressDir)) {
    fs.mkdirSync(progressDir, { recursive: true });
  }
  return path.join(progressDir, `progress-${getCurrentDate()}.json`);
};

// 保存进度
const saveProgress = (progressData) => {
  try {
    const progressFile = getProgressFilePath();
    fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2));
    console.log(`进度已保存到 ${progressFile}`);
  } catch (err) {
    console.error('保存进度失败:', err);
  }
};

// 加载进度
const loadProgress = () => {
  try {
    const progressFile = getProgressFilePath();
    if (fs.existsSync(progressFile)) {
      const data = fs.readFileSync(progressFile, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.error('加载进度失败:', err);
    return null;
  }
};

// 记录错误URL到日志文件
const logError = (url) => {
  try {
    const logFileName = `error-${getCurrentDate()}.log`;
    const logDir = path.join(process.cwd(), 'logs');
    console.log('日志目录路径:', logDir);
    
    if (!fs.existsSync(logDir)) {
      console.log('创建日志目录...');
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFilePath = path.join(logDir, logFileName);
    console.log('日志文件路径:', logFilePath);
    fs.appendFileSync(logFilePath, url + '\n');
    console.log(`\n\u26A0 错误已记录到 ${logFilePath}`);
  } catch (err) {
    console.error(err);
  }
};

for (let j = 0; j < process.argv.length; j++) {
  if (process.argv[j] == '-help') {
    argError = true;
    break;
  }
  if (process.argv[j] == '--restore') {
    restoreMode = true;
  }
  if (process.argv[j] == '--threads') {
    if (j + 1 < process.argv.length) {
      const threads = parseInt(process.argv[j + 1]);
      if (isNaN(threads) || threads < 1) {
        console.error('线程数必须是大于0的整数');
        argError = true;
        break;
      }
      threadCount = threads;
    }
  }
  if (process.argv[j] == '-dir'){
    dir=dir+process.argv[j+1]+'/'
  }
  if (process.argv[j] == '-type') {
    if (j + 1 < process.argv.length) {
      const type = process.argv[j + 1].toLowerCase();
      if (['pdf', 'markdown', 'html'].includes(type)) {
        outputType = type;
      } else {
        console.error(`Invalid output type: ${type}. Supported types are: pdf, markdown, html`);
        argError = true;
        break;
      }
    }
  }
  if (process.argv[j] == '-inputfile' || process.argv[j] == '-url') {
    if (j + 1 < process.argv.length) {
      if (process.argv[j] == '-inputfile') {
        let filename = process.argv[j + 1]
        if (fs.existsSync(filename)) {
          InputFile = filename;
        }
        else {
          console.error(filename + " not exists.")
          argError = true;
          break;
 
        }
      }
      else {
        URLS = URLS.concat(process.argv[j + 1].split(','))
      }
    }
    else {
      argError = true;
      break;
    }
  }
}

// 处理恢复模式
if (restoreMode) {
  const progressData = loadProgress();
  if (!progressData) {
    console.error('未找到进度文件，无法恢复');
    process.exit(1);
  }
  
  console.log('从之前的进度恢复...');
  URLS = progressData.urls;
  outputType = progressData.outputType;
  dir = progressData.dir;
  threadCount = progressData.threadCount;
  
  console.log(`恢复配置: 输出类型=${outputType}, 目录=${dir}, 线程数=${threadCount}`);
  console.log(`待处理URL数量: ${URLS.length}`);
} else {
  if (argError || (InputFile == null && URLS.length == 0)) {
    console.log(usage)
    return
  }
  
  if (InputFile != null) {
    let filecontent = fs.readFileSync(InputFile, { encoding: 'utf-8', flag: 'r' })
    URLS = URLS.concat(filecontent.split('\n')
      .map(url => url.trim())  // 去除每行首尾的空白字符
      .filter(url => url !== '')  // 过滤掉空行
    )
  }
}

const logProcess = (percent) => {
  const completed = Math.min(Math.floor(percent * 40), 40);
  process.stdout.write("\r\x1b[K");
  process.stdout.write(
    `\uD83D\uDEA7[${Array(completed).fill("=").join("")}${Array(40 - completed)
      .fill("-")
      .join("")}]`
  );
};

const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const STEP = 200;
      const TIME_INTERVAL = 200;

      let totalHeight = 0;

      const timer = setInterval(() => {
        const totalDistance = document.body.scrollHeight - window.innerHeight;

        window.scrollBy(0, STEP);
        totalHeight += STEP;

        console.log("progress", totalHeight / totalDistance);

        if (totalHeight >= totalDistance) {
          clearInterval(timer);
          resolve();
        }
      }, TIME_INTERVAL);
    });
  });
};

// 创建并管理worker线程
async function processUrlsWithWorkers(urls) {
  const total = urls.length;
  console.log(`开始导出 ${outputType.toUpperCase()} 文件 [${total}]，使用 ${threadCount} 个线程`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 初始化或加载进度数据
  let progressData;
  if (restoreMode) {
    progressData = loadProgress();
    if (progressData && progressData.workerProgress) {
      console.log('加载之前的进度数据...');
    } else {
      console.log('未找到有效的进度数据，重新开始...');
      progressData = null;
    }
  }

  if (!progressData) {
    // 创建新的进度数据
    const chunks = [];
    const chunkSize = Math.ceil(urls.length / threadCount);
    
    // 将URLs分成多个块
    for (let i = 0; i < urls.length; i += chunkSize) {
      chunks.push(urls.slice(i, i + chunkSize));
    }

    progressData = {
      urls: urls,
      outputType: outputType,
      dir: dir,
      threadCount: threadCount,
      startTime: new Date().toISOString(),
      workerProgress: chunks.map((chunk, index) => ({
        workerId: index,
        urls: chunk,
        startIndex: index * chunkSize,
        completedUrls: [],
        failedUrls: [],
        isCompleted: false
      }))
    };
    
    // 保存初始进度
    saveProgress(progressData);
  }

  const workers = [];
  const results = [];
  let completedCount = progressData.workerProgress.reduce((sum, wp) => sum + wp.completedUrls.length, 0);

  console.log(`已完成: ${completedCount}/${total}`);

  // 为每个未完成的worker块创建worker
  for (let i = 0; i < progressData.workerProgress.length; i++) {
    const workerProgress = progressData.workerProgress[i];
    
    if (workerProgress.isCompleted) {
      console.log(`Worker ${i + 1} 已完成，跳过`);
      continue;
    }

    // 计算剩余的URLs
    const remainingUrls = workerProgress.urls.filter(url => 
      !workerProgress.completedUrls.includes(url) && 
      !workerProgress.failedUrls.includes(url)
    );

    if (remainingUrls.length === 0) {
      workerProgress.isCompleted = true;
      continue;
    }

    console.log(`Worker ${i + 1} 剩余 ${remainingUrls.length} 个URL待处理`);

    const worker = new Worker('./worker.js', {
      workerData: {
        urls: remainingUrls,
        outputType,
        dir,
        startIndex: workerProgress.startIndex,
        total
      }
    });
    
    workers.push({ worker, workerId: i });

    worker.on('message', (result) => {
      completedCount++;
      
      // 更新进度数据
      if (result.success) {
        workerProgress.completedUrls.push(result.url);
      } else {
        workerProgress.failedUrls.push(result.url);
        logError(result.url);
        console.error(`导出失败: ${result.url}`);
        console.error(result.error);
      }
      
      results.push(result);
      
      // 检查该worker是否完成
      const totalProcessed = workerProgress.completedUrls.length + workerProgress.failedUrls.length;
      if (totalProcessed >= workerProgress.urls.length) {
        workerProgress.isCompleted = true;
      }
      
      // 保存进度
      saveProgress(progressData);
      
      // 显示总体进度
      const progress = (completedCount / total * 100).toFixed(1);
      console.log(`\n总进度: ${progress}% (${completedCount}/${total})`);
    });

    worker.on('error', (error) => {
      console.error(`Worker ${i + 1} 发生错误:`, error);
      completedCount++;
      saveProgress(progressData);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${i + 1} 异常退出，退出码: ${code}`);
      }
    });
  }

  // 等待所有worker完成
  if (workers.length > 0) {
    await Promise.all(workers.map(({ worker }) => {
      return new Promise((resolve) => {
        worker.on('exit', resolve);
      });
    }));
  }

  // 统计结果
  const totalCompleted = progressData.workerProgress.reduce((sum, wp) => sum + wp.completedUrls.length, 0);
  const totalFailed = progressData.workerProgress.reduce((sum, wp) => sum + wp.failedUrls.length, 0);
  
  console.log(`\n导出完成！成功: ${totalCompleted}，失败: ${totalFailed}`);
  console.log(`所有页面已导出为 ${outputType.toUpperCase()}`);
  
  // 如果全部完成，可以选择删除进度文件
  if (totalCompleted + totalFailed >= total) {
    console.log('所有任务已完成，进度文件将保留以供查看');
  }
}

// 主函数
(async () => {
  try {
    await processUrlsWithWorkers(URLS);
  } catch (error) {
    console.error('发生错误:', error);
  }
})();
