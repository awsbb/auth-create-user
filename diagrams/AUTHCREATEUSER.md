# AuthCreateUser
![](./AUTHCREATEUSER.png)

## WebSequenceDiagrams Code:
[WebSequenceDiagrams](https://www.websequencediagrams.comm)

```
title awsBB AuthCreateUser

participant "User" as u
participant "S3" as s3
participant "API Gateway" as api
participant "Lambda" as l
participant "DynamoDB" as db
participant "SES" as ses

u->s3: User enters registration details and clicks "Submit"
activate u
activate s3
s3->api: Call API
activate api
api->l: AuthCreateUser()
activate l
l->l: Validate Payload
l->l: Hash password/Generate salt
l->l: Create User object with token
l->db: Ensure user is unique, save with token
activate db
db-->l: Unique/Saved True/False/Error
deactivate db
l->l: Generate verification E-mail
l->ses: Send verification E-mail
activate ses
ses-->l: Sent True/False/Error
deactivate ses
l-->api: Success/Error
deactivate l
api-->s3: Success/Error
deactivate api
s3-->u: Render response
deactivate u
```
