const puppeteer = require("puppeteer");
//for wechat const SELECTOR = "#page-content > div";
const SELECTOR = ".widget-article";
const fs = require('fs')
let InputFile = null
let URLS = []
let argError = false;
let dir='output/'
let outputType = 'pdf' // 默认输出类型为pdf
let usage = `
Usage:
node multi.js [-help] <[-inputfile <file path>]|[-url <[url1][,url2]...[,urln]>]>
-help : Print command help information.
-inputfile <file path> : Specify a filename which contains urls need to be exported.
-url <[url1][,url2]...[,urln]>] : Specify one or more URLs which need to be exported, each URL will be separated by ','. 
-type <pdf|markdown|html> : Specify the output format type, default is pdf.
Examples:
node multi.js -inputfile D:\\urls.txt
node multi.js -url D:\\urls.txt
node multi.js -url D:\\urls.txt -type markdown
`

String.prototype.replaceAll = function(s1, s2) {
	return this.replace(new RegExp(s1, "gm"), s2);
}

for (let j = 0; j < process.argv.length; j++) {
  if (process.argv[j] == '-help') {
    argError = true;
    break;
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

(async () => {
  try {
    const browser = await puppeteer.launch();
    const total = URLS.length;
    console.log(`Start to exporting ${outputType.toUpperCase()} files [${total}]`)

    const page = await browser.newPage();
    
    if (!fs.existsSync(dir)){
      fs.mkdir(dir,(err)=>{
          if(err){
            console.log('创建目录${dir}出错')
          }else{
            //console.log('未出错')
          }
        })
    }
    for (let j = 0; j < URLS.length; j++) {
      const url = URLS[j];
      
      console.log("[" + (j + 1) + "/" + total + "] Exporting: " + url)
 
      try {
        // 检查是否是本地文件路径
        if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
          // 转换为文件URL格式
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

        console.log("\u26FDStart to generate!");

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
            // 创建一个新的临时页面来只包含目标内容
            const newPage = await browser.newPage();
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

        console.log(`\n\uD83C\uDF7B${filePath} generated!`);
      }catch (error) {
        console.error("[" + (j + 1) + "/" + total + "] Exporting:" + url + " failed")
        console.error(error)
      }
    }
    await browser.close();
    console.log(`Exported all pages as ${outputType.toUpperCase()}.`)
  } catch (error) {
  }
})();
