#include <assert.h>
#include "../armut_link/armut_link.c"
static int writes;
static esp_err_t apply(void *ctx,const char *id,bool requested,bool *actual) {
    (void)ctx; assert(!strcmp(id,"relay")); writes++; *actual=requested; return ESP_OK;
}
static esp_err_t read_channel(void *ctx,const char *id,double *value,uint32_t *age) {
    (void)ctx; (void)id; *value=1; *age=4; return ESP_OK;
}
static void command(struct armut_link *h,const char *id,int sequence,const char *boot,const char *channel) {
    char json[512];
    snprintf(json,sizeof(json),"{\"version\":1,\"reportIntervalMs\":2000,\"commands\":[{\"commandId\":\"%s\",\"sequence\":%d,\"bootId\":\"%s\",\"channelId\":\"%s\",\"value\":true}]}",id,sequence,boot,channel);
    cJSON *r=cJSON_ParseWithLength(json,strlen(json)); assert(r); consume(h,r); cJSON_Delete(r);
}
int main(void) {
    assert(shallow_json("{\"x\":\"[\"}",9));
    assert(!shallow_json("[[[[[[[[[[[[[[[[[",17));
    char boundary[98]; memset(boundary,'a',96); boundary[96]='\0';
    armut_channel_t channel={.id=boundary,.name="Channel",.kind=ARMUT_SWITCH};
    armut_link_config_t cfg={.server_url="http://controller",.device_id=boundary,
        .device_key="test-only",.role="node",.channels=&channel,.channel_count=1,.read=read_channel};
    assert(config_valid(&cfg));
    boundary[96]='a'; boundary[97]='\0'; assert(!config_valid(&cfg));
    boundary[96]='\0';
    const char *invalid[]={"", "with space", "Türkçe", "_prefix", ".prefix", "-prefix", "path/channel", "x\n"};
    for(size_t i=0;i<sizeof(invalid)/sizeof(invalid[0]);i++) {
        cfg.device_id=invalid[i]; assert(!config_valid(&cfg));
        cfg.device_id=boundary; channel.id=invalid[i]; assert(!config_valid(&cfg));
    }
    channel.id="A0_good.channel-1"; assert(config_valid(&cfg));
    cfg.channel_count=0; cfg.channels=NULL; cfg.read=NULL; cfg.role="camera";
    assert(config_valid(&cfg));
    struct armut_link h={0}; strcpy(h.boot,"boot-a"); strcpy(h.device,"node-a"); strcpy(h.role,"node");
    h.channels[0]=(armut_channel_t){.id="relay",.name="Relay",.kind=ARMUT_SWITCH};
    h.cfg.channel_count=1; h.cfg.apply=apply; h.cfg.read=read_channel;
    assert(writes==0);
    command(&h,"wrong-boot",1,"boot-b","relay"); assert(writes==0);
    command(&h,"first",1,"boot-a","relay"); assert(writes==1 && h.commands[0].pending);
    command(&h,"first",1,"boot-a","relay"); assert(writes==1 && h.commands[0].pending);
    command(&h,"other",1,"boot-a","relay"); assert(writes==1);
    command(&h,"sensor",2,"boot-a","missing"); assert(writes==1 && !h.commands[1].applied);
    for(int i=3;i<80;i++) { char id[32]; snprintf(id,sizeof(id),"cmd-%d",i); command(&h,id,i,"boot-a","relay"); }
    assert(writes==78 && h.used==32);
    command(&h,"first",1,"boot-a","relay"); assert(writes==78);
    command(&h,"cmd-79",79,"boot-a","relay"); assert(writes==78);
    cJSON *r=report(&h); assert(r && h.sequence==1);
    cJSON *es=cJSON_GetObjectItemCaseSensitive(r,"entities"); assert(cJSON_GetArraySize(es)==1);
    assert(cJSON_IsTrue(cJSON_GetObjectItemCaseSensitive(es->child,"value")));
    cJSON *as=cJSON_GetObjectItemCaseSensitive(r,"acknowledgements"); assert(cJSON_GetArraySize(as)==1);
    cJSON_Delete(r);
    puts("firmware protocol host tests passed");
}
