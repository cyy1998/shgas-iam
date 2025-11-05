setInterval(async () => {
    console.log('定时任务执行中...', new Date().toISOString());
    const res = await fetch('http://176.169.99.191:30010/send-message?phoneNumber=17721462865', {
        method: 'POST',
    })
    console.log(res)
    // 这里可以调用数据库、发送通知、清理缓存等
}, 40000);