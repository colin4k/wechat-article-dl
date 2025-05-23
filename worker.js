const { parentPort, workerData } = require('worker_threads');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SELECTOR = ".widget-article";

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

async function processUrl(page, url, index, total, outputType, dir) {
  try {
    console.log(`[${index + 1}/${total}] 正在导出: ${url}`);

    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
      const fileUrl = `file://${url.startsWith('/') ? url : require('path').resolve(process.cwd(), url)}`;
      await page.goto(fileUrl);
    } else {
      await page.goto(url);
    }

    page.on("console", (consoleObj) => {
      const content = consoleObj.text();
      if (content.startsWith("progress")) {
        logProcess(Number(consoleObj.text().split("progress ")[1]));
      }
    });

    console.log("\u26FD开始生成文件!");

    await autoScroll(page);
    await page.waitForSelector(SELECTOR);

    const element = await page.$(SELECTOR);
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
        }, SELECTOR);
        
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

  const { urls, outputType, dir, startIndex, total } = workerData;
  
  console.log(`Worker 启动，处理 ${urls.length} 个URL`);
  
  // 创建一个浏览器实例处理所有 URL
  (async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    try {
      // 串行处理该 worker 负责的所有 URL
      for (let i = 0; i < urls.length; i++) {
        const result = await processUrl(page, urls[i], startIndex + i, total, outputType, dir);
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