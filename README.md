# wechat article downloader

[[EN]](./README.EN.md)

![mark](./img/mark.png)

微信公众号文章下载，好文章保存到本地才是最靠谱的。

基于 [Puppeteer](https://github.com/puppeteer/puppeteer)。

## 使用

```bash
# 安装依赖
npm i

# 执行 `node multi.js [公众号文章链接清单文件]`
node multi.js -inputfile ~/Downloads/list.txt  -dir destdir
```

执行完成后，会生成 `output/distdir/[文章标题].pdf`

## 文章链接清单文件范例
```bash
# 这些文件通过 wechat-article-exporter 导出
file:///Users/colin/Downloads/xxx/xx1/index.html
file:///Users/colin/Downloads/xxx/xx2/index.html
```

![example](./img/example.png)

## 致谢
https://github.com/Cygra/wechat-article-dl
https://github.com/jooooock/wechat-article-exporter
