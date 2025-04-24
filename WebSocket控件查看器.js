// 关闭同名脚本
let killed = false;
(() => { let g = engines.myEngine(); var e = engines.all(), n = e.length; let r = g.getSource() + ""; 1 < n && e.forEach(e => { var n = e.getSource() + ""; g.id !== e.id && n == r && (() => { e.forceStop(); killed = true; })() }) })();
if (killed) {
  // 关闭其他脚本后需要延迟等待端口释放 避免卡死
  sleep(1000)
}
runtime.loadDex('./autojs-common.dex')
importClass(com.tony.autojs.search.UiObjectTreeBuilder)
importClass(java.util.concurrent.CountDownLatch)

let plugin_websocket = (() => {
  try {
    return plugins.load('com.tony.websocket')
  } catch (e) {
    toastLog('当前未安装websocket插件，加载失败' + e)
    exit()
  }
})()

if (!requestScreenCapture()) {
  toastLog('请求截图权限失败')
  exit()
}
auto.waitFor()

const uploadSessions = new java.util.concurrent.ConcurrentHashMap()

let connectedClients = []
let socketServer = plugin_websocket.createServer(8212, {
  onOpen: function (conn, handshake) {
    let address = conn.getRemoteSocketAddress() + ''
    console.log('client connect', address)
    connectedClients.push({
      address: address,
      conn: conn
    })
  },

  onClose: function (conn, code, reason, remote) {
    let address = conn.getRemoteSocketAddress() + ''
    let index = -1
    for (let i = 0; i < connectedClients.length; i++) {
      let c = connectedClients[i]
      if (c.address == address) {
        console.log('client disconnected', address)
        index = i
      }
    }
    if (index > -1) {
      connectedClients = connectedClients.splice(index, 1)
    }
  },

  onMessage: function (conn, message) {
    // 接收消息并根据消息结构进行处理
    handleRequest(conn, message)
  },

  onByteMessage: function (conn, byteBuffer) {
    // 接收二进制数据，特别处理文件传输
    handlByteRequest(conn, byteBuffer)
  },

  onError: function (conn, ex) {
    console.error('执行异常', ex)
    toastLog('线程启动失败 可能端口被占用了，请运行一下：关闭运行中的websocket线程.js 再试')
    exit()
  },
  onStart: function () {

    toastLog('服务已启动')
    let ipAddress = getIpAddress()
    console.log('ipAddress', ipAddress)
  }
})

socketServer.start()
setInterval(() => {

}, 20000)

events.on('exit', function () {
  socketServer.stop()
})


function wrapResp (requestData, code, message, dataAppender) {
  let response = { code, message }
  if (typeof requestData.callbackId != 'undefined') {
    response.callbackId = requestData.callbackId
  }
  if (typeof dataAppender === 'function') {
    dataAppender(response)
  }
  return JSON.stringify(response)
}

const requestDispatcher = {
  widget_info: (conn, requestData, msg) => {
    let getResult = buildWidgetResult(requestData)
    conn.send(wrapResp(requestData, getResult.code, getResult.msg, (r) => {
      Object.assign(r, getResult)
      r.type = 'widgetInfo'
    }))
    // conn.send(getResult.imgBase64)
  },
  operate: (conn, requestData, msg) => {
    console.log('执行脚本：', requestData.name, requestData.data, requestData.config)
    engines.execScript(requestData.name || 'tmp.js', requestData.data, requestData.config)
    conn.send(wrapResp(requestData, 'success', '操作成功'))
  },
  file: (conn, requestData, msg) => {
    console.log('接受文件上传元数据：', JSON.stringify(requestData))
    let { uploadId, fileName, savePath } = requestData
    console.log(uploadId, fileName, savePath)
    if (uploadId == null || fileName == null || savePath == null) {
      conn.send(wrapResp(requestData, 'error', '无效的文件上传元数据'))
      return
    }
    uploadSessions.put(uploadId, { fileName, savePath })
    conn.send(wrapResp(requestData, 'success', '记录元数据成功'))
  },
  log_dispatcher: (conn, requestData, msg) => {
    console.log('接收转发日志：', JSON.stringify(requestData))
    console.log('当前接入客户端数量：', connectedClients.length)
    let currentAddress = conn.getRemoteSocketAddress() + ''
    connectedClients.forEach(oc => {
      if (oc.address == currentAddress) {
        return
      }
      if (oc.conn.isOpen()) {
        console.log('dispatch log to:', oc.address)
        oc.conn.send(JSON.stringify({
          type: 'log_dispatcher',
          message: requestData.data
        }))
      } else {
        console.log(oc.address, 'is not open')
      }
    })
  }
}

/**
 * 处理websocket传递的数据
 * @param {WebSocketConnection} conn websocket连接
 * @param {String} message 传递的数据
 */
function handleRequest (conn, message) {
  try {
    let requestData = JSON.parse(message)
    let handler = requestDispatcher[requestData.type]
    if (handler) {
      handler(conn, requestData, message)
    } else {
      conn.send(wrapResp(requestData, 'error', '当前操作类型未定义：' + requestData.type))
    }
  } catch (e) {
    console.log('执行异常', e)
    conn.send(wrapResp({}, 'error', '执行异常' + e))
  }
}

function handlByteRequest (conn, byteBuffer) {
  if (byteBuffer == null) {
    conn.send(wrapResp({ type: 'file' }, 'error', '文件上传失败，无效的内容'))
    return
  }
  let bytes = byteBuffer.array()
  // TODO 提取上传id
  let { uploadId, data } = inspectUploadId(bytes)
  if (!uploadId) {
    conn.send(wrapResp({ type: 'file' }, 'error', '文件上传失败，提取uploadId失败'))
    return
  }
  let sessionInfo = uploadSessions.get(uploadId)
  if (sessionInfo) {
    let { fileName, savePath } = sessionInfo
    try {
      savePath = prepareSavePath(files.join(savePath, fileName))
      console.info("保存文件到路径：", files.path(savePath))
      files.writeBytes(savePath, data)
      conn.send(wrapResp({ type: 'file' }, 'success', '文件上传成功'))
    } catch (e) {
      console.error('保存文件内容异常', e)
      conn.send(wrapResp({ type: 'file' }, 'error', '文件上传失败，保存文件异常'))
    }
  } else {
    conn.send(wrapResp({ type: 'file' }, 'error', '文件上传失败，无效的上传id'))
  }
}

function prepareSavePath (savePath) {
  if (!files.ensureDir(savePath)) {
    throw new Error('保存路径无法创建，保存失败：' + savePath)
  }
  return savePath
}

function inspectUploadId (bytes) {
  let uploadId = null
  let index = 0
  console.log('获取二进制数据，总长度：', bytes.length)
  // console.log('content:', new java.lang.String(bytes))
  for (let i = 0; i < bytes.length; i++) {
    // console.log(i + ' => ', bytes[i])
    // 查找\r\n
    if (bytes[i] === 13 && bytes[i + 1] === 10) {
      uploadId = ''
      for (let j = 0; j < i; j++) {
        uploadId += String.fromCharCode(bytes[j])
      }
      index = i + 2
      break
    }
  }
  console.log('解析uploadId:', uploadId)
  return { uploadId, data: bytes.slice(index) }
}

/**
 * Builds a result for a widget info request.
 *
 * @return {Object} the result in JSON format, where the `code` field is 'success' if the result is successful, and 'error' if not.
 * The `widgetInfo` field contains the widget info, and `imgBase64` contains the image base64.
 */
function buildWidgetResult (requestData) {
  if (auto.clearCache) {
    console.log('清空控件缓存')
    auto.clearCache()
  }
  let countDown = new CountDownLatch(2)
  let resultObj = {}
  let widgetResult = []
  threads.start(function () {
    let widgetStart = new Date().getTime()
    widgetResult = requestWidgetInfos()
    let widgetCost = new Date().getTime() - widgetStart
    console.log('获取控件信息耗时', widgetCost)
    resultObj.widgetCost = widgetCost
    countDown.countDown()
  })
  threads.start(function () {
    let screen = null
    let captureStart = new Date().getTime()
    if (requestData.takeScreenshotByA11y && automator.takeScreenshot) {
      screen = automator.takeScreenshot()
    } else {
      screen = captureScreen()
    }
    let captureCost = new Date().getTime() - captureStart
    if (automator.takeScreenshot) {
      console.log('无障碍截图耗时', captureCost)
    } else {
      console.log('原生截图耗时', captureCost)
    }
    let imgBase64 = null
    let convertStart = new Date().getTime()
    if (screen) {
      imgBase64 = images.toBase64(screen, 'jpg') // PNG速度太慢
      console.log('图片转base64耗时', new Date().getTime() - convertStart)
      resultObj.imgBase64 = imgBase64
      resultObj.captureCost = captureCost
      resultObj.width = screen.width
      resultObj.height = screen.height
      resultObj.convertCost = new Date().getTime() - convertStart
    }
    countDown.countDown()
  })
  countDown.await()
  if (widgetResult[0]) {
    return Object.assign(resultObj, {
      code: 'success',
      msg: '获取控件信息成功',
      widgetInfo: widgetResult[1],
    })
  } else {
    return Object.assign(resultObj, {
      code: 'error',
      msg: widgetResult[1],
    })
  }

}

let maxDepth = -1
/**
 * Requests widget info and returns it as a JSON string.
 *
 * @return {Array} [boolean, string] the first item is a boolean indicating whether the result is successful, and the second item is a string which is the result in JSON format
 * if the result is successful, the second item will be a json string formated by {UiObjectInfo[]}, otherwise it will be an error message
 */
function requestWidgetInfos () {
  // 重置最大深度
  maxDepth = -1

  let treeNodeBuilder = null
  let supportOld = false
  try {
    treeNodeBuilder = new UiObjectTreeBuilder(runtime.getAccessibilityBridge())
    supportOld = true
  } catch (e) {
    treeNodeBuilder = new UiObjectTreeBuilder(null)
  }

  function buildTreeNode() {
    if (supportOld) {
      return treeNodeBuilder.buildTreeNode()
    } else {
      return treeNodeBuilder.buildTreeNode(runtime.accessibilityBridge.windowRoots())
    }
  }

  let start = new Date()
  let nodeList = buildTreeNode()
  console.log('获取总根节点数：', nodeList.size(), '耗时', new Date() - start)
  if (nodeList.size() <= 0) {
    toastLog('获取根节点失败 退出执行 请检查无障碍是否正常')
    return [false, '获取根节点失败 退出执行 请检查无障碍是否正常']
  }
  let root = nodeList.get(0)
  if (root) {
    let rawList = iterateAll(root).filter(v => v !== null)

    // 异步写入文件 用于后续分析

    let packageName = null
    // 过滤false和无效值 压缩json大小
    let content = JSON.stringify(rawList, (key, value) => {
      if (typeof value === 'undefined' || value === false) {
        return undefined
      }
      if (key == 'packageName') {
        if (packageName) {
          return undefined
        } else {
          packageName = value
        }
      }
      if (key == 'boundsInfo') {
        value = {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom
        }
      }
      return value
    })
    return [true, content]
  } else {
    return [false, '获取根节点数据失败']
  }
}
/**
 * 递归遍历控件树
 * @param {TreeNode} root  控件树的根节点
 * @param {number} [depth=0]  控件在控件树中的深度
 * @param {number} [index=0]  控件在同级控件中的索引
 * @return {UiObjectInfo[]}  控件信息数组
 */
function iterateAll (root, depth, index) {
  if (root.root == null) {
    return null
  }
  index = index || 0
  depth = depth || 0
  maxDepth = Math.max(maxDepth, depth)
  let uiObjectInfo = new UiObjectInfo(root.root, depth, index)
  if (root.getChildList().size() > 0) {
    return [uiObjectInfo].concat(toArray(root.getChildList()).map((child, index) => iterateAll(child, depth + 1, index)))
  } else {
    return [uiObjectInfo]
  }
}

/**
 * 信息类，用于描述一个控件
 * @param {AccessibilityNodeInfo} uiObject 控件对象
 * @param {number} depth 控件在控件树中的深度
 * @param {number} index 控件在同级控件中的索引
 */
function UiObjectInfo (uiObject, depth, index) {
  this.content = uiObject.text() || uiObject.desc() || ''
  this.isDesc = typeof uiObject.desc() !== 'undefined' && uiObject.desc() !== '' && uiObject.desc() != null
  this.id = uiObject.id()
  this.boundsInfo = uiObject.bounds()
  this.depth = depth
  this.index = index
  this.indexInParent = uiObject.indexInParent()
  this.visible = uiObject.visibleToUser()
  this.visibleToUser = uiObject.visibleToUser()
  this.clickable = uiObject.clickable()
  this.drawingOrder = uiObject.drawingOrder()
  this.className = uiObject.className()
  this.packageName = uiObject.packageName()
  this.mDepth = uiObject.depth()
  this.checkable = uiObject.checkable()
  this.checked = uiObject.checked()
  this.focusable = uiObject.focusable()
  this.focused = uiObject.focused()
  this.accessibilityFocused = uiObject.accessibilityFocused()
  this.selected = uiObject.selected()
  this.longClickable = uiObject.longClickable()
  this.enabled = uiObject.enabled()
  this.password = uiObject.password()
  this.scrollable = uiObject.scrollable()
  this.row = uiObject.row()
  this.column = uiObject.column()
  this.rowSpan = uiObject.rowSpan()
  this.columnSpan = uiObject.columnSpan()
  this.rowCount = uiObject.rowCount()
  this.columnCount = uiObject.columnCount()
  this.desc = uiObject.desc()
  this.text = uiObject.text()


  this.isEmpty = function (v) {
    return typeof v === 'undefined' || v === null || v === ''
  }

  this.hasUsableInfo = function () {
    return !(this.isEmpty(this.content) && this.isEmpty(this.id))
  }
}

function isEmpty (strOrList) {
  return typeof strOrList === 'undefined' || strOrList === null || strOrList === '' || strOrList.length === 0
}


importClass(java.net.InetAddress)
importClass(java.net.NetworkInterface)
importClass(java.util.Enumeration)


function getIpAddress () {
  try {
    let networkInterfaces = NetworkInterface.getNetworkInterfaces();
    let ipAddresses = []
    while (networkInterfaces.hasMoreElements()) {
      let networkInterface = networkInterfaces.nextElement();

      // 遍历网络接口中的所有 IP 地址
      let inetAddresses = networkInterface.getInetAddresses();
      while (inetAddresses.hasMoreElements()) {
        let inetAddress = inetAddresses.nextElement();

        if (!inetAddress.isLoopbackAddress() && inetAddress.isSiteLocalAddress()) {
          console.verbose("IP Address: " + inetAddress.getHostAddress());
          ipAddresses.push(inetAddress.getHostAddress());
        }
      }
    }
    return ipAddresses
  } catch (e) {
    console.error(e)
  }
}

function toArray (javaList) {
  const array = []
  for (let i = 0; i < javaList.size(); i++) {
    array.push(javaList.get(i))
  }
  return array
}