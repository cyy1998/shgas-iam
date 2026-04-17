#!/bin/bash

url="http://176.169.99.191:40010"

#权限设置
curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:menu:tender:query-CZLX", "privName": "采招立项查询"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:menu:tender:query-ZBFA", "privName": "方案审批查询"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:menu:tender:query-CZJG", "privName": "结果汇报查询"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:menu:tender:query-process", "privName": "流程查询"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:SR", "privName": "集团选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:SB", "privName": "市北选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:PD", "privName": "浦销选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:DZ", "privName": "大众选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:JS", "privName": "金山选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:CM", "privName": "崇明选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:QP", "privName": "青浦选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:BS", "privName": "宝山选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:XX", "privName": "信息选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:JF", "privName": "经服选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:GW", "privName": "管网选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:DF", "privName": "东能选择"}'

curl -X POST "$url/admin/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"privCode": "ui:checkbox:tender:WH", "privName": "五号沟选择"}'

#角色设置

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "roleName": "集团审查者"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sub-viewer", "roleName": "分公司审查者"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sr-user", "roleName": "集团用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sb-user", "roleName": "市北用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:pd-user", "roleName": "浦销用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:dz-user", "roleName": "大众用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:js-user", "roleName": "金山用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:cm-user", "roleName": "崇明用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:qp-user", "roleName": "青浦用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:bs-user", "roleName": "宝山用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:xx-user", "roleName": "信息用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:jf-user", "roleName": "经服用户"}'

curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:gw-user", "roleName": "管网用户"}'


curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:df-user", "roleName": "东能用户"}'


curl -X POST "$url/admin/role/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:wh-user", "roleName": "五号沟用户"}'


# 设置角色权限关系

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sr-user", "privCode": "ui:checkbox:tender:SR"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sb-user", "privCode": "ui:checkbox:tender:SB"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:pd-user", "privCode": "ui:checkbox:tender:PD"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:dz-user", "privCode": "ui:checkbox:tender:DZ"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:js-user", "privCode": "ui:checkbox:tender:JS"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:cm-user", "privCode": "ui:checkbox:tender:CM"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:qp-user", "privCode": "ui:checkbox:tender:QP"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:bs-user", "privCode": "ui:checkbox:tender:BS"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:xx-user", "privCode": "ui:checkbox:tender:XX"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:jf-user", "privCode": "ui:checkbox:tender:JF"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:gw-user", "privCode": "ui:checkbox:tender:GW"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:df-user", "privCode": "ui:checkbox:tender:DF"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:wh-user", "privCode": "ui:checkbox:tender:WH"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:SR"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:SB"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:PD"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:DZ"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:JS"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:CM"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:QP"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:BS"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:XX"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:JF"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:GW"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:DF"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:checkbox:tender:WH"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:menu:tender:query-CZLX"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:menu:tender:query-ZBFA"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:menu:tender:query-CZJG"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "privCode": "ui:menu:tender:query-process"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sub-viewer", "privCode": "ui:menu:tender:query-CZLX"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sub-viewer", "privCode": "ui:menu:tender:query-ZBFA"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sub-viewer", "privCode": "ui:menu:tender:query-CZJG"}'

curl -X POST "$url/admin/role/privilege/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sub-viewer", "privCode": "ui:menu:tender:query-process"}'

#组织角色设置

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sr-user", "orgCode": "SR", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:sb-user", "orgCode": "SB", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:pd-user", "orgCode": "PD", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:dz-user", "orgCode": "DZ", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:js-user", "orgCode": "JS", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:cm-user", "orgCode": "CM", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:qp-user", "orgCode": "QP", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:bs-user", "orgCode": "BS", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:xx-user", "orgCode": "XX", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:jf-user", "orgCode": "JF", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:gw-user", "orgCode": "GW", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:df-user", "orgCode": "DF", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:wh-user", "orgCode": "WH", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "orgCode": "SR25", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "orgCode": "SR08", "isAllSub":true}'

curl -X POST "$url/admin/role/organization/set" \
     -H "Content-Type: application/json" \
     -d '{"roleCode": "tender:all-viewer", "orgCode": "SR11", "isAllSub":true}'



