importClass(java.lang.Thread)
console.show()

threads.start(function () {
    events.on('exit', function () {
        console.log('30秒后关闭控制台')
        setTimeout(() => console.hide(), 30000)
    })
})

doKillWebsocketThread()

// 遍历所有线程，查找目标端口占用的线程（假设有线索）
function doKillWebsocketThread() {
    let rootGroup = Thread.currentThread().getThreadGroup();
    while (rootGroup.getParent() != null) {
        rootGroup = rootGroup.getParent();
    }

    // 两种方法创建数组
    let threads = util.java.array('java.lang.Thread', rootGroup.activeCount())
    console.info('运行中线程数量', rootGroup.activeCount())
    rootGroup.enumerate(threads);

    for (let thread of threads) {
        if (thread == null) {
            continue
        }
        let threadName = thread.getName() + ''
        console.log(thread.getId() + ' thread name:', threadName)
        if (threadName.indexOf('WebSocket') > -1) {
          console.info('关闭线程：', thread.getId(), thread.getName())
          thread.interrupt()
        }
    }
}
