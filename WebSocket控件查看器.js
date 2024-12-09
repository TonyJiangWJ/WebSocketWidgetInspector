// 关闭同名脚本
(() => { let g = engines.myEngine(); var e = engines.all(), n = e.length; let r = g.getSource() + ""; 1 < n && e.forEach(e => { var n = e.getSource() + ""; g.id !== e.id && n == r && e.forceStop() }) })();


runtime.loadDex('./autojs-common.dex')
importClass(com.tony.autojs.search.UiObjectTreeBuilder)

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

let socketServer = plugin_websocket.createServer(8212, {
  onOpen: function (conn, handshake) {

  },

  onClose: function (conn, code, reason, remote) {

  },

  onMessage: function (conn, message) {
    // 接收消息并根据消息结构进行处理
    handleRequest(conn, message)
  },

  onByteMessage: function (conn, bytes) {

  },

  onError: function (conn, ex) {

  },
  onStart: function () {

    toastLog('服务已启动')
    let ipAddress = getIpAddress()
    console.log('ipAddress', ipAddress)
  }
}
)

socketServer.start()
setInterval(() => {

}, 20000)

events.on('exit', function () {
  socketServer.stop()
})


function wrapResp (code, message, dataAppender) {
  let response = { code, message }
  if (typeof dataAppender === 'function') {
    dataAppender(response)
  }
  return JSON.stringify(response)
}

const requestDispatcher = {
  widget_info: (conn, requestData, msg) => {
    let getResult = buildWidgetResult()
    conn.send(wrapResp(getResult.code, getResult.msg, (r) => {
      r.widgetInfo = getResult.widgetInfo
      r.imgBase64 = getResult.imgBase64
      r.width = getResult.width
      r.height = getResult.height
      r.type = 'widgetInfo'
    }))
  },
  operate: (conn, requestData, msg) => {
    console.log('执行脚本：', requestData.name, requestData.data, requestData.config)
    engines.execScript(requestData.name || 'tmp.js', requestData.data, requestData.config)
    conn.send(wrapResp('success', '操作成功'))
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
      conn.send(wrapResp('error', '当前操作类型未定义：' + requestData.type))
    }
  } catch (e) {
    console.log('执行异常', e)
    conn.send(wrapResp('error', '执行异常' + e))
  }
}

/**
 * Builds a result for a widget info request.
 *
 * @return {Object} the result in JSON format, where the `code` field is 'success' if the result is successful, and 'error' if not.
 * The `widgetInfo` field contains the widget info, and `imgBase64` contains the image base64.
 */
function buildWidgetResult () {
  let widgetStart = new Date().getTime()
  let widgetResult = requestWidgetInfos()
  console.log('获取控件信息耗时', new Date().getTime() - widgetStart)
  let screen = null
  let captureStart = new Date().getTime()
  if (automator.takeScreenshot) {
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
    imgBase64 = images.toBase64(screen)
    console.log('图片转base64耗时', new Date().getTime() - convertStart)
  }

  if (widgetResult[0]) {
    return {
      code: 'success',
      msg: '获取控件信息成功',
      widgetInfo: widgetResult[1],
      imgBase64: imgBase64,
      width: screen.width,
      height: screen.height,
    }
  } else {
    return {
      code: 'error',
      msg: widgetResult[1],
      imgBase64: imgBase64,
      width: screen.width,
      height: screen.height,
    }
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
  let treeNodeBuilder = new UiObjectTreeBuilder(runtime.getAccessibilityBridge())

  let nodeList = treeNodeBuilder.buildTreeNode()
  console.log('获取总根节点数：', nodeList.size())
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
    return [uiObjectInfo].concat(runtime.bridges.bridges.toArray(root.getChildList()).map((child, index) => iterateAll(child, depth + 1, index)))
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
