/* eslint-disable camelcase */
import axios from 'axios';
import querystring from 'querystring';
import moment from 'moment';

import BMWURLs from '../helpers/urls';
import Vehicle from '../helpers/vehicle';
import logger from '../helpers/logger';
import { VEHICLE_VIEWS } from '../constants';

const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));

class API {
    constructor() {
        this.initialized = false;
    }

    /**
     *
     * * Initialization params
     * @typedef {Object} APIInitObject
     * @property {('eu'|'us'|'cn')} region - Region where you have created the ConnectedDrive account
     * @property {string} username - The username (user@example.com)
     * @property {string} password - The password
     * @property {Boolean} [debug=false] - If you want debugging messages shown
     * @property {Boolean} [skipVehicles=false] - If you want to skip the initial request of vehicles and do it manually with API.getVehicles()
     *
     * * Initializes the API
     *
     * @param {APIInitObject}
     * @memberof API
     */
    async init({
        region,
        username,
        password,
        debug = false,
        skipVehicles = false,
    }) {
        if (!region || !username || !password) {
            throw new Error(
                'You must specify all the required parameters (region, username, password)'
            );
        }
        this.initialized = true;
        this.region = region;
        this.username = username;
        this.password = password;
        this.vehicles = [];
        this.BMWURLs = new BMWURLs(region);
        this.oauthToken = null;
        this.refreshToken = null;
        this.tokenExpiresAt = null;

        logger.init(debug);
        logger.log('initialized API with', {
            region,
            username,
            password,
            debug,
        });
        // eslint-disable-next-line no-unused-expressions
        if (!skipVehicles) {
            await this.getVehicles();
        }
        return true;
    }

    /**
     * Make a generic request to BMW API
     *
     * @param {String} url
     * @returns {Promise}
     * @memberof API
     */
    async request(
        url,
        { overwriteHeaders = {}, method = 'GET', postData = {} } = {}
    ) {
        if (!this.initialized)
            throw new Error('You called a function before init()');
        logger.log('making request', url);
        if (
            !this.oauthToken ||
            (this.tokenExpiresAt && moment().isAfter(this.tokenExpiresAt))
        ) {
            await this.getToken();
            await sleep(1000); // if the request is made too quickly the API will reject it with 500
        }

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Bearer ${this.oauthToken}`,
            ...overwriteHeaders,
        };

        const axiosMethod = method === 'GET' ? axios.get : axios.post;

        const { data } = await axiosMethod({
            url,
            method,
            headers,
            data: postData,
        });

        logger.log('request response', data);

        return data;
    }

    /**
     * Gets the auth token from BMW API
     *
     * @memberof API
     */
    async getToken() {
        if (!this.initialized)
            throw new Error('You called a function before init()');
        logger.log('getting token');
        const { username, password } = this;
        const postData = querystring.stringify({
            grant_type: 'password',
            scope: 'authenticate_user vehicle_data remote_services',
            username,
            password,
        });

        const headers = {
            Authorization:
                'Basic blF2NkNxdHhKdVhXUDc0eGYzQ0p3VUVQOjF6REh4NnVuNGNEanliTEVOTjNreWZ1bVgya0VZaWdXUGNRcGR2RFJwSUJrN3JPSg==',
            Credentials:
                'nQv6CqtxJuXWP74xf3CJwUEP:1zDHx6un4cDjybLENN3kyfumX2kEYigWPcQpdvDRpIBk7rOJ',
        };
        logger.log('token data', { postData, headers });
        const { data } = await axios.post({
            url: this.BMWURLs.getAuthURL(),
            data: postData,
            headers,
        });

        logger.log('token response', { data });

        const { access_token, expires_in } = data;

        this.oauthToken = access_token;
        this.tokenExpiresAt = moment().add(expires_in, 'seconds');
    }

    /**
     * Gets your vehicles from BMW API and stores them
     *
     * @memberof API
     */
    async getVehicles() {
        if (!this.initialized)
            throw new Error('You called a function before init()');
        const data = await this.request(this.BMWURLs.getVehiclesURL());

        if (data.vehicles) {
            this.vehicles = data.vehicles.map(
                vehicle => new Vehicle(vehicle, this)
            );
        }

        logger.log('VEHICLES', data);
        return this.vehicles;
    }

    get currentVehicles() {
        if (!this.initialized)
            throw new Error('You called a function before init()');
        return this.vehicles;
    }
}

// adding constants
const exported = new API();
exported.VEHICLE_VIEWS = VEHICLE_VIEWS;

export default exported;
