"use strict";
/* istanbul ignore file */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
module.exports = {
    setup(s3db) {
        return __awaiter(this, void 0, void 0, function* () {
            this.client = s3db.client;
            this.started = false;
            this.client.costs = {
                total: 0,
                prices: {
                    put: 0.000005,
                    post: 0.000005,
                    copy: 0.000005,
                    list: 0.000005,
                    get: 0.0000004,
                    select: 0.0000004,
                    delete: 0.0000004,
                },
                requests: {
                    total: 0,
                    put: 0,
                    post: 0,
                    copy: 0,
                    list: 0,
                    get: 0,
                    select: 0,
                    delete: 0,
                },
            };
        });
    },
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            const addRequest = (req) => {
                this.client.costs.requests[req]++;
                this.client.costs.total += this.client.costs.prices[req];
            };
            this.client.on("request", (name) => {
                this.client.costs.requests.total++;
                if (name === "getObject")
                    addRequest("get");
                else if (name === "putObject")
                    addRequest("put");
                else if (name === "headObject")
                    addRequest("get");
                else if (name === "deleteObject")
                    addRequest("delete");
                else if (name === "deleteObjects")
                    addRequest("delete");
                else if (name === "listObjectsV2")
                    addRequest("list");
            });
            this.started = true;
        });
    }
};
