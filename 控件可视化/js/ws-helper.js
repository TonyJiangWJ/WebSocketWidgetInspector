/*
 * @Author: TonyJiangWJ
 * @Date: 2024-12-12 11:38:56
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2024-12-16 14:50:11
 * @Description: 
 */

let ws = null;          // WebSocket 实例
let retryTimeout = 1000; // 初始重连间隔（毫秒）
let maxRetryTimeout = 30000; // 最大重连间隔
let isConnected = false; // WebSocket 连接状态
let id = 0
const callbacks = {}
const wsCaller = {
  // 直接发送
  send: function (msgObj) {
    if (ws && isConnected) {
      ws.send(JSON.stringify(msgObj))
    }
  },
  invoke: function (type, msgObj, callback, reject) {
    if (!ws || !isConnected) {
      reject('ws服务未连接')
      return
    }
    let callbackId = ++id
    callbacks[callbackId] = callback
    msgObj.callbackId = callbackId
    msgObj.type = type
    ws.send(JSON.stringify(msgObj))
  },
}
/**
 * 将请求包装，适合链式调用
 */
const wsApi = {
  request: function (type, msgObj) {
    return new Promise((resolve, reject) => {
      wsCaller.invoke(type, msgObj, (resp) => resolve(resp), reject)
    })
  }
}

function createWebsocket (serverUrl, _this) {
  ws = new WebSocket(serverUrl);

  // 重连逻辑
  function reconnectWebSocket () {
    if (isConnected || !ws) return; // 如果已经连接则不重连

    setTimeout(() => {
      console.log(`Retrying WebSocket connection...`);
      createWebsocket(serverUrl, _this); // 再次初始化连接
      retryTimeout = Math.min(retryTimeout * 2, maxRetryTimeout); // 指数增长重连时间，限制最大值
    }, retryTimeout);
  }
  // 连接成功
  ws.onopen = () => {
    _this.connecting = true
    isConnected = true;
    retryTimeout = 1000; // 重置重连间隔
    _this.connectStatus = 'ready'
    console.log("WebSocket connection opened");
  };

  // 接收消息
  ws.onmessage = (event) => {
    if (event.data instanceof Blob) {
      console.log('接收二进制数据')
      // todo 执行二进制数据处理
      return
    }
    // 可以在此处理接收到的消息
    // addMessage("Message from server:" + event.data, 'orange')
    let result = JSON.parse(event.data)
    // 处理异步回调
    if (typeof result.callbackId != 'undefined' && typeof callbacks[result.callbackId] != 'undefined') {
      callbacks[result.callbackId](result)
      delete callbacks[result.callbackId]
      return
    }
    // widgetInfo请求过大 不适合全部打印
    if (result.type !== 'widgetInfo') {
      console.log("Message from server:", event.data);
    }
  };

  // 连接关闭
  ws.onclose = () => {
    _this.requesting = false
    isConnected = false;
    _this.connectStatus = 'disconnected'
    console.log("WebSocket connection closed. Retrying...");
    reconnectWebSocket();
  };

  // 连接出错
  ws.onerror = (error) => {
    _this.requesting = false
    isConnected = false;
    _this.connectStatus = 'disconnected'
    console.error("WebSocket error:", error);
    ws.close(); // 主动关闭以触发重连逻辑
  }
}