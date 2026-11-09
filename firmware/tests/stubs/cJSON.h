/* Host declarations for the public cJSON 1.x ABI; linked to system libcjson.
 * No cJSON implementation is included. ESP-IDF builds use IDF's own header. */
#pragma once
#include <stddef.h>
typedef struct cJSON { struct cJSON *next,*prev,*child; int type; char *valuestring; int valueint; double valuedouble; char *string; } cJSON;
cJSON *cJSON_CreateObject(void);
cJSON *cJSON_AddStringToObject(cJSON *,const char *,const char *);
cJSON *cJSON_AddNumberToObject(cJSON *,const char *,double);
cJSON *cJSON_AddBoolToObject(cJSON *,const char *,int);
cJSON *cJSON_AddArrayToObject(cJSON *,const char *);
int cJSON_AddItemToArray(cJSON *,cJSON *);
void cJSON_Delete(cJSON *);
char *cJSON_PrintUnformatted(const cJSON *);
cJSON *cJSON_ParseWithLength(const char *,size_t);
cJSON *cJSON_GetObjectItemCaseSensitive(const cJSON *,const char *);
int cJSON_IsNumber(const cJSON *);
int cJSON_IsArray(const cJSON *);
int cJSON_IsString(const cJSON *);
int cJSON_IsBool(const cJSON *);
int cJSON_IsTrue(const cJSON *);
int cJSON_GetArraySize(const cJSON *);
#define cJSON_ArrayForEach(e,a) for((e)=(a)?(a)->child:NULL;(e);(e)=(e)->next)
cJSON *cJSON_ParseWithLengthOpts(const char *,size_t,const char **,int);

cJSON *cJSON_AddNullToObject(cJSON *,const char *);

int cJSON_IsNull(const cJSON *);
