"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _1 = __importDefault(require("."));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const { bucket = "", accessKeyId = "", secretAccessKey = "", prefix = "/databases/mydatabase", } = process.env;
function ClientFactory() {
    return new _1.default({
        uri: `s3://${accessKeyId}:${secretAccessKey}@${bucket}${prefix}`,
    });
}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10 * 1000;
describe("static config", function () {
    let client = ClientFactory();
    it("constructor definitions", function () {
        return __awaiter(this, void 0, void 0, function* () {
            expect(client.bucket).toBe(bucket);
            expect(client.keyPrefix).toBe("databases/mydatabase");
        });
    });
});
describe("start", function () {
    let client = ClientFactory();
    it("setup", function () {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            yield client.setup();
            expect(client.metadata).toBeDefined();
            expect((_a = client.metadata) === null || _a === void 0 ? void 0 : _a.version).toBeDefined();
            expect((_b = client.metadata) === null || _b === void 0 ? void 0 : _b.resources).toBeDefined();
        });
    });
});
describe("resources", function () {
    let client = ClientFactory();
    beforeAll(function () {
        return __awaiter(this, void 0, void 0, function* () {
            yield client.setup();
        });
    });
    it("create resourceList leads", function () {
        return __awaiter(this, void 0, void 0, function* () {
            yield client.newResource({
                resourceName: "leads",
                attributes: {
                    utm: {
                        source: 'string|optional',
                        medium: 'string|optional',
                        campaign: 'string|optional',
                        term: 'string|optional',
                    },
                    lead: {
                        personalEmail: "email",
                        fullName: "string",
                        mobileNumber: "string",
                    },
                },
            });
            expect(client.metadata.resources.leads).toBeDefined();
        });
    });
    it("create a lead", function () {
        return __awaiter(this, void 0, void 0, function* () {
            let createdResource = yield client.insert({
                resourceName: "leads",
                id: "mypersonal@email.com",
                attributes: {
                    utm: {
                        source: 'abc'
                    },
                    lead: {
                        fullName: "My Complex Name",
                        personalEmail: "mypersonal@email.com",
                        mobileNumber: "+5511234567890",
                    }
                },
            });
            const request = yield client.getById({ resourceName: "leads", id: createdResource.id });
            yield client.resource("leads").get(createdResource.id);
            expect(createdResource.id).toEqual(request.id);
        });
    });
});
