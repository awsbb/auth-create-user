import Boom from 'boom';
import Joi from 'joi';

import crypto from 'crypto';
import Promise from 'bluebird';
import AWS from 'aws-sdk';

if (process.env.NODE_ENV === 'production') {
  global.SES = new AWS.SES();
}

import { computeHash } from '@awsbb/hashing';

const boomError = ({ message, code = 500 }) => {
  const boomData = Boom.wrap(new Error(message), code).output.payload;
  return new Error(JSON.stringify(boomData));
};

const DynamoDB = new AWS.DynamoDB({
  region: process.env.REGION,
  endpoint: new AWS.Endpoint(process.env.DDB_ENDPOINT)
});

const length = 128;

const createUserWithToken = ({ email, password, salt }) => {
  return new Promise((resolve) => {
    const token = crypto.randomBytes(length).toString('hex');
    resolve({
      email,
      password,
      salt,
      token
    });
  });
};

const ensureUser = ({ email, password, salt, token }) => {
  return new Promise((resolve, reject) => {
    DynamoDB.putItem({
      TableName: 'awsBB_Users',
      Item: {
        email: {
          S: email
        },
        passwordHash: {
          S: password
        },
        passwordSalt: {
          S: salt
        },
        verified: {
          BOOL: false
        },
        verifyToken: {
          S: token
        }
      },
      ConditionExpression: 'attribute_not_exists (email)'
    }, (err) => {
      if (err) {
        return reject(err);
      }
      resolve({
        email,
        password,
        salt,
        token
      });
    });
  });
};

const sendVerificationEmail = ({ email, token }) => {
  return new Promise((resolve, reject) => {
    const subject = `Verification Email [${process.env.EXTERNAL_NAME}]`;
    const verificationLink = `${process.env.VERIFICATION_PAGE}?email=${encodeURIComponent(email)}&verify=${token}&type=user`;
    const HTML = `
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
      <title>${subject}</title>
    </head>
    <body>
      Please <a href="${verificationLink}">click here to verify your email address</a> or copy & paste the following link in a browser:<br><br><a href="${verificationLink}">${verificationLink}</a>
    </body>
    </html>
    `;

    SES.sendEmail({
      Source: process.env.EMAIL_SOURCE,
      Destination: {
        ToAddresses: [
          email
        ]
      },
      Message: {
        Subject: {
          Data: subject
        },
        Body: {
          Html: {
            Data: HTML
          }
        }
      }
    }, (err, info) => {
      if (err) {
        return reject(err);
      }
      resolve(info);
    });
  });
};

const joiEventSchema = Joi.object().keys({
  email: Joi.string().email(),
  password: Joi.string().min(6),
  confirmation: Joi.string().min(6)
});

const joiOptions = {
  abortEarly: false
};

const validate = (event) => {
  return new Promise((resolve, reject) => {
    Joi.validate(event, joiEventSchema, joiOptions, (err) => {
      if (err) {
        return reject(err);
      }
      if (event.password === event.confirmation) {
        return resolve();
      }
      reject(boomError({
        message: 'Invalid Password/Confirmation Combination',
        code: 400
      }));
    });
  });
};

export function handler(event, context) {
  const email = event.payload.email;
  const password = event.payload.password;

  return validate(event.payload)
    .then(() => computeHash({ password }))
    .then(({ salt, hash }) => createUserWithToken({ email, password: hash, salt }))
    .then((user) => ensureUser(user))
    .then(({ token }) => sendVerificationEmail({ email, token }))
    .then(() => {
      context.succeed({
        success: true
      });
    })
    .catch((err) => {
      context.fail(err);
    });
}
