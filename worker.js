const { parentPort, workerData } = require('worker_threads');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const logProcess = (percent) => {
  // 确保进度值在0-1之间
  const validPercent = Math.max(0, Math.min(1, percent));
  const completed = Math.floor(validPercent * 40);
  const remaining = 40 - completed;
  
  process.stdout.write("\r\x1b[K");
  process.stdout.write(
    `\uD83D\uDEA7[${"=".repeat(completed)}${"-".repeat(remaining)}] ${(validPercent * 100).toFixed(1)}%`
  );
};

const autoScroll = async (page) => {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const STEP = 200;
      const TIME_INTERVAL = 200;
      let totalHeight = 0;
      let lastHeight = 0;
      let scrollAttempts = 0;
      const MAX_ATTEMPTS = 50; // 最大滚动尝试次数

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const totalDistance = scrollHeight - viewportHeight;
        
        // 如果已经滚动到底部或达到最大尝试次数，则停止
        if (totalHeight >= totalDistance || scrollAttempts >= MAX_ATTEMPTS) {
          clearInterval(timer);
          resolve();
          return;
        }

        // 检查是否真的在滚动
        if (lastHeight === scrollHeight) {
          scrollAttempts++;
        } else {
          scrollAttempts = 0;
          lastHeight = scrollHeight;
        }

        window.scrollBy(0, STEP);
        totalHeight += STEP;

        // 计算并发送进度
        const progress = Math.min(totalHeight / totalDistance, 1);
        console.log("progress", progress);
      }, TIME_INTERVAL);
    });
  });
};

async function processUrl(page, url, index, total, outputType, dir, selector) {
  try {
    console.log(`\n[${index + 1}/${total}] 正在导出: ${url}`);

    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      const fileUrl = `file://${url.startsWith('/') ? url : require('path').resolve(process.cwd(), url)}`;
      await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    } else {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    }

    // 设置控制台消息监听器
    page.on("console", (consoleObj) => {
      const content = consoleObj.text();
      if (content.startsWith("progress")) {
        try {
          const progress = parseFloat(content.split("progress ")[1]);
          if (!isNaN(progress)) {
            logProcess(progress);
          }
        } catch (err) {
          // 忽略解析错误
        }
      }
    });

    console.log("\u26FD开始生成文件!");

    await autoScroll(page);
    await page.waitForSelector(selector, { timeout: 10000 });

    const element = await page.$(selector);
    if (!element) {
      throw new Error(`未找到选择器 "${selector}" 对应的内容`);
    }

    await element.evaluate((el) => (el.style.padding = "16px"));

    const title = await (await page.title()).replaceAll('？','').replaceAll('/','、').replaceAll(' ','');
    let filePath;
    
    switch(outputType) {
      case 'markdown':
        const content = await page.evaluate(() => {
          return element ? element.innerText : '';
        });
        filePath = `${dir}${title}.md`;
        fs.writeFileSync(filePath, content);
        break;
      case 'html':
        const htmlContent = await page.evaluate(() => {
          return element ? element.outerHTML : '';
        });
        filePath = `${dir}${title}.html`;
        fs.writeFileSync(filePath, htmlContent);
        break;
      default: // pdf
        filePath = `${dir}${title}.pdf`;
        const newPage = await page.browser().newPage();
        const html = await page.evaluate((selector) => {
          const element = document.querySelector(selector);
          if (!element) return '';
          return `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                <style>
                  body { 
                    margin: 0; 
                    padding: 20px;
                    width: 100%;
                  }
                  .content { 
                    max-width: 100%;
                    width: 100%;
                  }
                  img {
                    max-width: 100%;
                    height: auto;
                    display: block;
                  }
                </style>
              </head>
              <body>
                <div class="content">${element.outerHTML}</div>
              </body>
            </html>
          `;
        }, selector);
        
        await newPage.setContent(html);
        await newPage.pdf({
          path: filePath,
          format: 'A4',
          printBackground: true,
          margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px'
          },
          preferCSSPageSize: true,
          scale: 0.9
        });
        await newPage.close();
    }

    console.log(`\n\uD83C\uDF7B${filePath} 生成完成!`);
    return { success: true, url, filePath };
  } catch (error) {
    console.error(`\n\u26A0 处理失败: ${url} - ${error.message}`);
    return { success: false, url, error: error.message };
  }
}

// 检查是否直接运行 worker
if (require.main === module) {
  if (!workerData || !workerData.urls) {
    console.error('Worker 未接收到数据或数据格式不正确');
    process.exit(1);
  }

  const { urls, outputType, dir, selector = 'html', startIndex, total } = workerData;
  
  console.log(`Worker 启动，处理 ${urls.length} 个URL，使用选择器: ${selector}`);
  
  // 创建一个浏览器实例处理所有 URL
  (async () => {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    try {
      // 串行处理该 worker 负责的所有 URL
      for (let i = 0; i < urls.length; i++) {
        const result = await processUrl(page, urls[i], startIndex + i, total, outputType, dir, selector);
        // 立即发送结果到主进程
        parentPort.postMessage(result);
      }
    } catch (error) {
      console.error('Worker 处理失败:', error);
    } finally {
      await browser.close();
      console.log('Worker 完成所有任务');
    }
  })().catch(error => {
    console.error('Worker 初始化失败:', error);
    process.exit(1);
  });
} 