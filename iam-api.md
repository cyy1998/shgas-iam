# IAM API文档

## 1. 登录

- url: http://176.169.99.150/api/auth/login
- request body: 
```json
{
    "username":"string",
    "password":"string"
}
```

## 2. 登出

- url: http://176.169.99.150/api/auth/logout


## 3. 当前信息用户

- url: http://176.169.99.150/api/self/user-info

## 4. 发送手机验证码

- url: http://176.169.99.150/api/auth/send-message?phoneNumber={phone}
- return:
```json
{
    "data":{
        "code":"2677"
    }
}
```

## 5. 验证码登录

- url: http://176.169.99.150/api/auth/mobile-login
- request body: 
```json
{
    "phoneNumber":"string",
    "code":"string"
}
```



