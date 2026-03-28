import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { extname } from 'path';

@Injectable()
export class FirebaseStorageService {
  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    const bucket = admin.storage().bucket();
    const filename = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
    const fileRef = bucket.file(filename);

    await fileRef.save(file.buffer, {
      metadata: { contentType: file.mimetype },
    });

    await fileRef.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${filename}`;
  }
}
