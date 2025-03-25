package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid" // 新增UUID包
	"github.com/gorilla/websocket"
)

// FileMeta 文件元数据
type FileMeta struct {
	Type     string `json:"type"`
	FileName string `json:"fileName"`
	SavePath string `json:"savePath"`
	FileSize int64  `json:"fileSize"`
	FileExt  string `json:"fileExt"`
	UploadId string `json:"uploadId"`
}

func main() {

	// 定义命令行参数变量
	var (
		filePath = flag.String("file", "default.txt", "文件路径")
		savePath = flag.String("save", "/sdcard/脚本/测试用/", "保存路径")
		host     = flag.String("host", "192.168.22.235:8212", "服务地址")
	)

	// 解析参数（必须调用）
	flag.Parse()
	fileName := filepath.Base(*filePath)
	newSavePath := strings.Replace(*savePath, fileName, "", 1)
	// 使用参数
	fmt.Printf("文件路径: %s\n", *filePath)
	fmt.Printf("文件名称: %s\n", fileName)
	fmt.Printf("保存路径: %s\n", newSavePath)
	fmt.Printf("服务地址: %s\n", *host)

	// 设置WebSocket服务器地址
	u := url.URL{Scheme: "ws", Host: *host, Path: "/"}
	log.Printf("Connecting to %s", u.String())

	// 建立WebSocket连接
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatal("Dial error:", err)
	}
	defer conn.Close()

	// 读取文件内容
	content, err := ioutil.ReadFile(*filePath)
	if err != nil {
		log.Fatal("Read file error:", err)
	}

	// 获取文件信息
	fileInfo, err := os.Stat(*filePath)
	if err != nil {
		log.Fatal("Get file info error:", err)
	}

	// 生成随机UUID（新增部分）
	uploadID := uuid.New().String()

	// 准备元数据
	meta := FileMeta{
		Type:     "file",
		FileName: filepath.Base(*filePath),
		SavePath: newSavePath,
		FileSize: fileInfo.Size(),
		FileExt:  filepath.Ext(*filePath),
		UploadId: uploadID, // 替换为随机UUID
	}

	// 将元数据序列化为JSON
	metaJson, err := json.Marshal(meta)
	if err != nil {
		log.Fatal("JSON marshal error:", err)
	}

	// 先发送元数据(作为文本消息)
	if err := conn.WriteMessage(websocket.TextMessage, metaJson); err != nil {
		log.Fatal("Send metadata error:", err)
	}
	// 在发送元数据之后添加响应处理
	_, resp, err := conn.ReadMessage()
	if err != nil {
		log.Fatal("等待元数据响应失败:", err)
	}
	log.Printf("服务端元数据响应: %s", resp)
	// 添加uploadId
	content = append(
		append([]byte(uploadID), []byte("\r\n")...),
		content...,
	)
	// 然后发送文件内容(作为二进制消息)
	if err := conn.WriteMessage(websocket.BinaryMessage, content); err != nil {
		log.Fatal("Send file content error:", err)
	}
	// 在发送文件内容之后添加响应处理
	_, resp, err = conn.ReadMessage()
	if err != nil {
		log.Fatal("等待文件响应失败:", err)
	}
	log.Printf("服务端文件处理响应: %s", resp)

	fmt.Println("File sent successfully!")
}
