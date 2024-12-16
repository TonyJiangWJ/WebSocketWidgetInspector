/*
 * @Author: TonyJiangWJ
 * @Date: 2024-12-15 17:55:30
 * @Last Modified by: TonyJiangWJ
 * @Last Modified time: 2024-12-16 14:49:49
 * @Description: 本地数据库支持工具，将历史控件数据保存到indexedDB
 */


const DBHelper = new function () {
  const dbRequest = indexedDB.open('history-info-db', 1);
  this.historyInfoDB = null
  const dbStoreName = 'history-infos'
  const _this = this

  dbRequest.onupgradeneeded = function (event) {
    _this.historyInfoDB = event.target.result;
    // 创建对象存储（类似表）
    if (!_this.historyInfoDB.objectStoreNames.contains(dbStoreName)) {
      _this.historyInfoDB.createObjectStore(dbStoreName, { keyPath: 'timestamp' }); // 主键为 "timestamp"
    }
  };

  dbRequest.onsuccess = function (event) {
    _this.historyInfoDB = event.target.result
    console.log('Database opened successfully');
  };

  dbRequest.onerror = function (event) {
    console.error('Database failed to open', event.target.error);
  };

  this.addDataWithLimit = function (data, maxLimit = 10) {
    return new Promise((resolve, reject) => {

      const transaction = this.historyInfoDB.transaction(dbStoreName, 'readwrite'); // 开启读写事务
      const store = transaction.objectStore(dbStoreName);

      // Step 1: 统计记录数量
      const countRequest = store.count();

      countRequest.onsuccess = function () {
        const count = countRequest.result;

        if (count >= maxLimit) {
          console.log(`Limit reached (${count}). Deleting the oldest record...`);

          // Step 2: 删除最早记录
          const cursorRequest = store.openCursor(); // 按主键顺序遍历

          cursorRequest.onsuccess = function (event) {
            const cursor = event.target.result;
            if (cursor) {
              store.delete(cursor.key); // 删除主键最小的记录
              console.log(`Deleted record with key: ${cursor.key}`);
            }

            // Step 3: 添加新记录
            addDataToStore(store, data);
          };

          cursorRequest.onerror = function (event) {
            console.error('Error opening cursor:', event.target.error);
            reject('Error opening cursor:' + event.target.error)
          };
        } else {
          // 如果记录未超出限制，直接添加数据
          addDataToStore(store, data);
        }
      };

      countRequest.onerror = function (event) {
        console.error('Error counting records:', event.target.error);
        reject('Error counting records:' + event.target.error)
      };

      transaction.oncomplete = function () {
        console.log('Transaction completed.');
        resolve()
      };

      transaction.onerror = function (event) {
        console.error('Transaction error:', event.target.error);
        reject('Transaction error:' + event.target.error)
      };
    })
  }

  function addDataToStore (store, data) {
    const addRequest = store.add(data);

    addRequest.onsuccess = function () {
      console.log('Data added successfully:', data);
    };

    addRequest.onerror = function (event) {
      console.error('Error adding data:', event.target.error);
    };
  }

  this.addData = function (data) {
    return new Promise((resolve, reject) => {
      const transaction = this.historyInfoDB.transaction(dbStoreName, 'readwrite'); // 开启读写事务
      const store = transaction.objectStore(dbStoreName);
      store.add(data); // 添加数据

      transaction.oncomplete = function () {
        console.log('Data added successfully');
        resolve()
      };

      transaction.onerror = function (event) {
        console.error('Error adding data', event.target.error);
        reject(event.target.error)
      };
    })
  }

  this.getAllData = function () {

    return new Promise((resolve, reject) => {
      const transaction = this.historyInfoDB.transaction(dbStoreName, 'readonly');
      const store = transaction.objectStore(dbStoreName);
      const request = store.openCursor(); // 打开游标
      const resultList = []
      request.onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
          resultList.push(cursor.value); // 当前数据
          cursor.continue(); // 移动到下一个
        } else {
          console.log('No more data');
          resolve(resultList)
        }
      };

      request.onerror = function (event) {
        console.error('Error opening cursor', event.target.error);
        reject(event.target.error)
      };
    })
  }

  this.deleteData = function (timestamp) {
    return new Promise((resolve, reject) => {

      const transaction = this.historyInfoDB.transaction(dbStoreName, 'readwrite');
      const store = transaction.objectStore(dbStoreName);
      store.delete(timestamp); // 根据主键删除数据

      transaction.oncomplete = function () {
        console.log('Data deleted successfully');
        resolve()
      };

      transaction.onerror = function (event) {
        console.error('Error deleting data', event.target.error);
        reject(event.target.error)
      };
    })
  }

  this.getData = function (timestamp) {
    return new Promise((resolve, reject) => {
      const transaction = this.historyInfoDB.transaction(dbStoreName, 'readonly'); // 开启只读事务
      const store = transaction.objectStore(dbStoreName);
      const request = store.get(timestamp); // 根据主键获取数据

      request.onsuccess = function (event) {
        console.log('Data retrieved:', event.target.result);
        resolve(event.target.result)
      };

      request.onerror = function (event) {
        console.error('Error retrieving data', event.target.error);
        reject(event.target.error)
      };
    })
  }

  this.waitForConnected = function () {
    return new Promise(async (resolve, reject) => {
      if (this.historyInfoDB != null) {
        resolve(this)
      } else {
        waitUntilReady(resolve)
      }
    })
  }

  function waitUntilReady (resolver) {
    if (_this.historyInfoDB != null) {
      console.log('DB加载完毕')
      resolver(_this)
      return
    }

    console.log('等待DB加载完毕')
    setTimeout(() => waitUntilReady(resolver), 500)
  }

  this.updateObjectInfo = function (key, totalWidgets, smallImg, deviceWidth, deviceHeight) {
    new Promise((resolve, reject) => {

      const transaction = this.historyInfoDB.transaction(dbStoreName, 'readwrite');
      const store = transaction.objectStore(dbStoreName);


      const getReq = store.get(key); // 根据主键获取数据

      getReq.onsuccess = function (event) {
        console.log('Data retrieved:', event.target.result);
        let data = event.target.result
        data.totalWidgets = totalWidgets
        data.smallImg = smallImg
        data.deviceHeight = deviceHeight
        data.deviceWidth = deviceWidth
        try {
          data.packageName = JSON.parse(data.uiobjects)[0].packageName
          console.log('包名：', data.packageName)
        } catch (e) {
          console.error('提取packageName失败', e)
        }

        store.put(data); // 更新数据（如果键已存在，则覆盖）

      };

      getReq.onerror = function (event) {
        console.error('Error retrieving data', event.target.error);
        reject(event.target.error)
      };


      transaction.oncomplete = function () {
        console.log('Data updated successfully');
        resolve()
      };

      transaction.onerror = function (event) {
        console.error('Error updating data', event.target.error);
        reject(event.target.error)
      };

    })
  }
}