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
let usage = `
Usage:
node multi.js [-help] <[-inputfile <file path>]|[-url <[url1][,url2]...[,urln]>]>
-help : Print command help information.
-inputfile <file path> : Specify a filename which contains urls need to be exported.
-url <[url1][,url2]...[,urln]>] : Specify one or more URLs which need to be exported, each URL will be separated by ','. 
-type <pdf|markdown|html> : Specify the output format type, default is pdf.
--threads <number> : Specify the number of threads to use, default is 1.
Examples:
node multi.js -inputfile D:\\urls.txt
node multi.js -url D:\\urls.txt
node multi.js -url D:\\urls.txt -type markdown
node multi.js -url D:\\urls.txt --threads 4
`

String.prototype.replaceAll = function(s1, s2) {
	return this.replace(new RegExp(s1, "gm"), s2);
}

// 获取当前日期字符串，格式：YYYY-MM-DD
const getCurrentDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

  const chunks = [];
  const chunkSize = Math.ceil(urls.length / threadCount);
  
  // 将URLs分成多个块
  for (let i = 0; i < urls.length; i += chunkSize) {
    chunks.push(urls.slice(i, i + chunkSize));
  }

  const workers = [];
  const results = [];
  let completedCount = 0;

  // 为每个块创建一个worker
  for (let i = 0; i < chunks.length; i++) {
    const worker = new Worker('./worker.js', {
      workerData: {
        urls: chunks[i],
        outputType,
        dir,
        startIndex: i * chunkSize,
        total
      }
    });
    
    workers.push(worker);

    worker.on('message', (result) => {
      completedCount++;
      if (!result.success) {
        logError(result.url);
        console.error(`导出失败: ${result.url}`);
        console.error(result.error);
      }
      results.push(result);
      
      // 显示总体进度
      const progress = (completedCount / total * 100).toFixed(1);
      console.log(`\n总进度: ${progress}% (${completedCount}/${total})`);
    });

    worker.on('error', (error) => {
      console.error(`Worker ${i + 1} 发生错误:`, error);
      completedCount++;
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${i + 1} 异常退出，退出码: ${code}`);
      }
    });
  }

  // 等待所有worker完成
  await Promise.all(workers.map(worker => {
    return new Promise((resolve) => {
      worker.on('exit', resolve);
    });
  }));

  // 统计结果
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`\n导出完成！成功: ${successCount}，失败: ${failCount}`);
  console.log(`所有页面已导出为 ${outputType.toUpperCase()}`);
}

// 主函数
(async () => {
  try {
    await processUrlsWithWorkers(URLS);
  } catch (error) {
    console.error('发生错误:', error);
  }
})();
