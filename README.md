# populate bible brain tables
deploy:
 npm run build 
 serverless deploy --verbose -s qa

