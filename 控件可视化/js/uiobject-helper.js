/*
 * @Author: TonyJiangWJ
 * @Date: 2024-12-12 10:23:42
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2024-12-16 14:49:38
 * @Description: 
 */
let allKey = []
let allObject = []
let canvasWidth = 400
let deviceWidth = 1080
let deviceHeight = 2340
let idChecker = new Set()
let packageName = null
let columns = [
  {
    key: 'boundsInfo',
    convert: item => {
      let { left, right, top, bottom } = item.boundsInfo
      return `rect:[${left},${top},${right},${bottom}] region:[${left},${top},${right - left},${bottom - top}]`
    }
  },
  { key: 'desc' },
  { key: 'text' },
  { key: 'id' },
  { key: 'depth' },
  { key: 'indexInParent' },
  { key: 'drawingOrder' },
  { key: 'visibleToUser', isBoolean: true },
  { key: 'clickable', isBoolean: true },
  { key: 'longClickable', isBoolean: true },
  { key: 'className' },
  { key: 'packageName' },
  { key: 'checkable', isBoolean: true },
  { key: 'checked', isBoolean: true },
  { key: 'focusable', isBoolean: true },
  { key: 'focused', isBoolean: true },
  { key: 'accessibilityFocused', isBoolean: true },
  { key: 'selected', isBoolean: true },
  { key: 'enabled', isBoolean: true },
  { key: 'password', isBoolean: true },
  { key: 'scrollable', isBoolean: true },
  { key: 'row' },
  { key: 'rowCount' },
  { key: 'rowSpan' },
  { key: 'column' },
  { key: 'columnCount' },
  { key: 'columnSpan' },
]
function buildWithChild (childArray, filter, duplicatedObjects) {
  let rootNode = childArray[0]
  columns.forEach(item => {
    if (item.isBoolean) {
      rootNode[item.key] = falseIfUndefined(item, rootNode[item.key])
    }
    if (item.key == 'packageName') {
      if (typeof rootNode.packageName == "undefined") {
        rootNode.packageName = packageName
      } else {
        packageName = rootNode.packageName
      }
    }
  })
  // 用于过滤bounds信息
  rootNode.bounds = function () {
    return new BoundsInfo(rootNode.boundsInfo)
  }
  if (typeof filter != "undefined" && !filter(rootNode, childArray)) {
    console.log('过滤无效节点')
    return null
  }
  allObject.push(rootNode)
  let name = ''
  if (rootNode.id) {
    name += ' id:' + rootNode.id
  }
  if (rootNode.content) {
    name += ` [${!!rootNode.desc ? 'desc' : 'text'}]:${rootNode.content}`
  }
  if (rootNode.boundsInfo) {
    let bounds = rootNode.boundsInfo
    name += ` bounds: [${bounds.left}, ${bounds.top} - ${bounds.right}, ${bounds.bottom}]`
  }
  let { left, top, right, bottom } = rootNode.boundsInfo
  let root = {
    open: true,
    root: rootNode,
    id: `${rootNode.depth}-${rootNode.indexInParent}_${rootNode.id ? rootNode.id : ''}[${left}_${top}_${right}_${bottom}]`,
    name,
    visible: rootNode.visible,
    children: []
  }
  while (idChecker.has(root.id)) {
    console.error('id 重复 ', root.id)
    root.id += 'x'
  }
  idChecker.add(root.id)
  allKey.push(root.id)
  let key = `${left}_${top}_${right}_${bottom}`
  duplicatedObjects[key] = [root].concat(duplicatedObjects[key]).filter(obj => !!obj)
  if (childArray.length > 1) {
    let i = 0
    for (let i = 1; i < childArray.length; i++) {
      let child = buildWithChild(childArray[i], filter, duplicatedObjects)
      if (child) {
        root.children.push(child)
      }
    }
    // console.log(root.children)
    root.children = root.children.sort((a, b) => {
      let idxA = a.root.indexInParent
      let idxB = b.root.indexInParent
      return idxA - idxB
    })
  }
  // this.$refs.treeNode.updateAll()
  return root
}

function findOpenedParent (root, selectedCache) {
  let opened = []
  findOpened(root, selectedCache, opened)
  return opened
}

function findOpened (root, selectedCache, opened) {
  if (selectedCache.has(root.id)) {
    opened.push(root.id)
    return true
  }
  if (!root.children || root.children.length <= 0) {
    return false
  }
  let hasChild = false
  for (let i = 0; i < root.children.length; i++) {
    let child = root.children[i]
    if (selectedCache.has(child.id)) {
      opened.push(root.id)
      hasChild = true
    }
    if (findOpened(child, selectedCache, opened)) {
      opened.push(root.id)
      hasChild = true
    }
  }
  return hasChild
}
function falseIfUndefined (item, value) {
  if (typeof value !== "undefined") {
    return value
  }
  if (item.isBoolean) {
    return false
  }
  return undefined
}

function hasValidChild (childArray, func) {
  if (!childArray || childArray.length < 1) {
    return false
  }
  if (func(childArray[0])) {
    return true
  }
  for (let i = 1; i < childArray.length; i++) {
    if (hasValidChild(childArray[i], func)) {
      return true
    }
  }
  return false
}

function hasVisiableChild (childArray) {
  if (!childArray || childArray.length < 1) {
    return false
  }
  if (childArray[0].visible) {
    return true
  }
  for (let i = 1; i < childArray.length; i++) {
    if (hasVisiableChild(childArray[i])) {
      return true
    }
  }
  return false
}

function hasClickableChild (childArray) {
  if (!childArray || childArray.length < 1) {
    return false
  }
  if (childArray[0].clickable + '' == 'true') {
    console.log('clickable:' + childArray.clickable)
    return true
  }
  for (let i = 1; i < childArray.length; i++) {
    if (hasClickableChild(childArray[i])) {
      return true
    }
  }
  return false
}

function widthInScreen (x) {
  return x >= 0 && x <= deviceWidth
}

function heightInScreen (y) {
  return y >= 0 && y <= deviceHeight
}

function boundsInScreen (left, top, right, bottom) {
  return widthInScreen(left) && widthInScreen(right) && heightInScreen(top) && heightInScreen(bottom)
}

function boundsInside (root, l, t, r, b) {
  let { left, top, right, bottom } = root.boundsInfo
  return left >= l && right <= r && top >= t && bottom <= b
}
function boundsContains (root, l, t, r, b) {
  let { left, top, right, bottom } = root.boundsInfo
  return left <= l && right >= r && top <= t && bottom >= b
}

function Selector (node) {
  this.filters = []
  this.bounds = function (l, t, r, b) {
    this.filters.push(v => {
      let { left, top, right, bottom } = root.boundsInfo
      return left == l && top == t && right == r && bottom == b
    })
    return this
  }
  this.boundsInside = function (l, t, r, b) {
    this.filters.push(v => boundsInside(v, l, t, r, b))
    return this
  }
  this.boundsContains = function (l, t, r, b) {
    this.filters.push(v => boundsContains(v, l, t, r, b))
    return this
  }

  this.depth = function (depth) {
    this.filters.push(v => v.depth == depth)
    return this
  }

  this.text = function (text) {
    this.filters.push(v => v.text == text)
    return this
  }

  this.textContains = function (text) {
    this.filters.push(v => v.text && v.text.indexOf(text) > -1)
    return this
  }

  this.textMatches = function (text) {
    this.filters.push(v => v.text && new RegExp('^' + text + '$').test(v.text))
    return this
  }

  this.textStartsWith = function (start) {
    this.filters.push(v => v.text && v.text.startsWith(start))
    return this
  }

  this.textEndsWith = function (end) {
    this.filters.push(v => v.text && v.text.endsWith(end))
    return this
  }

  this.desc = function (desc) {
    this.filters.push(v => v.desc == desc)
    return this
  }

  this.descContains = function (desc) {
    this.filters.push(v => v.desc && v.desc.indexOf(desc) > -1)
    return this
  }

  this.descMatches = function (desc) {
    this.filters.push(v => v.desc && new RegExp('^' + desc + '$').test(v.desc))
    return this
  }

  this.descStartsWith = function (start) {
    this.filters.push(v => v.desc && v.desc.startsWith(start))
    return this
  }

  this.descEndsWith = function (end) {
    this.filters.push(v => v.desc && v.desc.endsWith(end))
    return this
  }

  this.id = function (id) {
    this.filters.push(v => v.id == id)
    return this
  }

  this.idContains = function (id) {
    this.filters.push(v => v.id && v.id.indexOf(id) > -1)
    return this
  }

  this.idMatches = function (id) {
    this.filters.push(v => v.id && new RegExp('^' + id + '$').test(v.id))
    return this
  }

  this.idStartsWith = function (start) {
    this.filters.push(v => v.id && v.id.startsWith(start))
    return this
  }

  this.idEndsWith = function (end) {
    this.filters.push(v => v.id && v.id.endsWith(end))
    return this
  }


  this.className = function (className) {
    this.filters.push(v => v.className == className)
    return this
  }

  this.classNameContains = function (className) {
    this.filters.push(v => v.className && v.className.indexOf(className) > -1)
    return this
  }

  this.classNameMatches = function (className) {
    this.filters.push(v => v.className && new RegExp('^' + className + '$').test(v.className))
    return this
  }

  this.classNameStartsWith = function (start) {
    this.filters.push(v => v.className && v.className.startsWith(start))
    return this
  }

  this.classNameEndsWith = function (end) {
    this.filters.push(v => v.className && v.className.endsWith(end))
    return this
  }
  this.drawingOrder = function (check) {
    this.filters.push(v => v.drawingOrder == check)
    return this
  }

  this.indexInParent = function (index) {
    this.filters.push(v => v.indexInParent == index)
    return this
  }

  this.clickable = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => {
      let result = v.clickable == check
      if (result) {
        // console.log('check?', check)
        // console.log('clickable:', v.clickable)
        // console.log("v：", JSON.stringify(v))
        return true
      }
      return false
    })
    return this
  }

  this.longClickable = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.longClickable == check)
    return this
  }

  this.checkable = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.checkable == check)
    return this
  }

  this.selected = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.selected == check)
    return this
  }

  this.enabled = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.enabled == check)
    return this
  }

  this.scrollable = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.scrollable == check)
    return this
  }

  this.editable = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.editable == check)
    return this
  }

  this.visibleToUser = function (check) {
    if (typeof check === "undefined") {
      check = true
    }
    this.filters.push(v => v.visibleToUser == check)
    return this
  }

  this.filter = function (func) {
    this.filters.push(func)
    return this
  }

  this.find = function () {
    if (this.filters.length > 0) {
      for (let i = 0; i < this.filters.length; i++) {
        let f = this.filters[i]
        if (!f(node)) {
          return false
        }
      }
    }
    return true
  }
}

function BoundsInfo (boundsInfo) {
  this.left = boundsInfo.left
  this.top = boundsInfo.top
  this.right = boundsInfo.right
  this.bottom = boundsInfo.bottom
  this.width = () => boundsInfo.right - boundsInfo.left
  this.height = () => boundsInfo.bottom - boundsInfo.top
  this.centerX = () => (boundsInfo.right + boundsInfo.left) / 2
  this.centerY = () => (boundsInfo.bottom + boundsInfo.top) / 2
}

function formatDate (date, fmt) {
  if (typeof fmt === 'undefined') {
    fmt = "yyyy-MM-dd HH:mm:ss"
  }

  var o = {
    'M+': date.getMonth() + 1, // 月份
    'd+': date.getDate(), // 日
    'h+': date.getHours() % 12 === 0 ? 12 : date.getHours() % 12, // 小时
    'H+': date.getHours(), // 小时
    'm+': date.getMinutes(), // 分
    's+': date.getSeconds(), // 秒
    'q+': Math.floor((date.getMonth() + 3) / 3), // 季度
    'S': date.getMilliseconds() // 毫秒
  }
  var week = {
    '0': '\u65e5',
    '1': '\u4e00',
    '2': '\u4e8c',
    '3': '\u4e09',
    '4': '\u56db',
    '5': '\u4e94',
    '6': '\u516d'
  }
  let execResult
  if (/(y+)/.test(fmt)) {
    execResult = /(y+)/.exec(fmt)
    fmt = fmt.replace(execResult[1], (date.getFullYear() + '').substring(4 - execResult[1].length))
  }
  if (/(E+)/.test(fmt)) {
    execResult = /(E+)/.exec(fmt)
    fmt = fmt.replace(execResult[1], ((execResult[1].length > 1) ? (execResult[1].length > 2 ? '\u661f\u671f' : '\u5468') : '') + week[date.getDay() + ''])
  }
  for (var k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      execResult = new RegExp('(' + k + ')').exec(fmt)
      fmt = fmt.replace(execResult[1], (execResult[1].length === 1) ? (o[k]) : (('00' + o[k]).substring(('' + o[k]).length)))
    }
  }
  return fmt
}
/**
 * 压缩 Base64 图像
 * @param {string} base64 - 原始 Base64 字符串
 * @param {number} targetWidth - 压缩后的宽度
 * @param {number} targetHeight - 压缩后的高度
 * @param {number} quality - 输出质量（0 到 1）
 * @returns {Promise<string>} 返回压缩后的 Base64 字符串
 */
function compressBase64Image (base64, targetWidth, targetHeight, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      // 创建 Canvas 元素
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      // 将图片绘制到 Canvas 上
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // 导出压缩后的 Base64 图像
      const compressedBase64 = canvas.toDataURL('image/png', quality); // 质量范围 0-1
      resolve(compressedBase64);
    };
    img.onerror = reject;
    img.src = base64; // 加载 Base64 图像
  });
}