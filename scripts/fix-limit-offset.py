import re

with open('D:/GitApp/communityMis/backend/src/auth/mysql-store.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: listCommunityPosts
old1 = 'LIMIT ? OFFSET ?\n\t`, [\n\t      ...(viewerId === null ? [] : [viewerId, viewerId]),\n\t      ...params,\n\t      pageSize,\n\t      offset\n\t    ]);'
new1 = 'LIMIT ${pageSize} OFFSET ${offset}\n\t`, [\n\t      ...(viewerId === null ? [] : [viewerId, viewerId]),\n\t      ...params\n\t    ]);'
count1 = content.count(old1)
content = content.replace(old1, new1)
print(f'Fix1: {count1}')

# Fix 2: listCollectionsForUserId
old2 = 'LIMIT ? OFFSET ?\n\t`, [...params, pageSize, offset]);\n\t    const totalRow = await pooledOne(`SELECT COUNT(*) AS total FROM `user_collection` uc ${where}`, params);'
new2 = 'LIMIT ${pageSize} OFFSET ${offset}\n\t`, [...params]);\n\t    const totalRow = await pooledOne(`SELECT COUNT(*) AS total FROM `user_collection` uc ${where}`, params);'
count2 = content.count(old2)
content = content.replace(old2, new2)
print(f'Fix2: {count2}')

# Fix 3: listMessageThread
old3 = 'LIMIT ? OFFSET ?\n\t`, [...params, pageSize, offset]);\n\t    const totalRow = await pooledOne(`\n\tSELECT COUNT(*) AS total\n\tFROM `message` m\n\tWHERE ((m.`sender_id` = ? AND m.`receiver_id` = ?) OR (m.`sender_id` = ? AND m.`receiver_id` = ?))'
new3 = 'LIMIT ${pageSize} OFFSET ${offset}\n\t`, [...params]);\n\t    const totalRow = await pooledOne(`\n\tSELECT COUNT(*) AS total\n\tFROM `message` m\n\tWHERE ((m.`sender_id` = ? AND m.`receiver_id` = ?) OR (m.`sender_id` = ? AND m.`receiver_id` = ?))'
count3 = content.count(old3)
content = content.replace(old3, new3)
print(f'Fix3: {count3}')

with open('D:/GitApp/communityMis/backend/src/auth/mysql-store.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
